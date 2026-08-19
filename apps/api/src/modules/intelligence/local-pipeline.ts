import type {
  AssetClass,
  AssetDnaEnvelope,
  CurrencyCode,
  DnaEntity,
  DnaFact,
  DnaRelationship,
  DnaTimelineEvent,
  DocumentType,
  RiskSummary,
  ValuationSummary,
} from '@caprov/types';
import { createId } from '../../infrastructure/database/ids';
import {
  AS_OF_RE,
  DATE_RE,
  extractFactsAccurate,
  normalizeExtractionText,
  pickValueFact,
  resolveValuationAsOf,
} from './extraction-accuracy';
import { attachProjection } from './projection-engine';

export interface PipelineDocument {
  id: string;
  name: string;
  type: DocumentType;
  extractedText?: string;
}

export interface PipelineAsset {
  id: string;
  name: string;
  assetClass: AssetClass;
  currency: CurrencyCode;
  location?: string;
  jurisdiction?: string;
}

const ENTITY_RE =
  /\b([A-Z][A-Za-z0-9&.’'-]*(?:\s+[A-Z][A-Za-z0-9&.’'-]*){0,5}\s(?:Ltd|Limited|LLP|LLC|LP|Pte Ltd|SARL|Inc|AG|GmbH|Partners|Holdings|Capital|Fund III|Fund II|Fund))\b/g;

export function classifyDocument(name: string, text: string, fallback: DocumentType): DocumentType {
  const haystack = `${name} ${normalizeExtractionText(text)}`.toLowerCase();
  if (/(title|land registry|deed|proprietor|notarial|kadaster|sla title)/.test(haystack)) return 'TITLE_DEED';
  if (/(share purchase|sale and purchase|bill of sale|spa\b|gallery invoice)/.test(haystack)) return 'SPA';
  if (/(valuation|appraisal|market value|fair value|nav statement|knightvale|dcf|appraised)/.test(haystack)) {
    return 'VALUATION_MEMO';
  }
  if (/(insurance|insured value|hull|sum insured|replacement cost|reinstatement)/.test(haystack)) return 'INSURANCE';
  if (/(kyc|beneficial ownership|aml)/.test(haystack)) return 'KYC';
  if (/(limited partnership agreement|\blpa\b)/.test(haystack)) return 'LPA';
  if (/(financial statement|balance sheet|\bnav\b)/.test(haystack)) return 'FINANCIAL_STATEMENT';
  return fallback || 'OTHER';
}

function extractFacts(documents: PipelineDocument[]): DnaFact[] {
  return extractFactsAccurate(documents);
}

function extractEntities(asset: PipelineAsset, documents: PipelineDocument[]): DnaEntity[] {
  const names = new Map<string, DnaEntity>();
  names.set(asset.name.toLowerCase(), {
    id: createId('ent'),
    name: asset.name,
    canonicalName: asset.name,
    type: 'ASSET',
    aliases: [],
    confidence: 0.99,
  });
  if (asset.location) {
    names.set(asset.location.toLowerCase(), {
      id: createId('ent'),
      name: asset.location,
      canonicalName: asset.location,
      type: 'LOCATION',
      aliases: [],
      confidence: 0.9,
    });
  }
  for (const document of documents) {
    const text = document.extractedText ?? '';
    for (const match of text.matchAll(ENTITY_RE)) {
      const captured = match[1];
      if (!captured) continue;
      const name = captured.replace(/\s+/g, ' ').trim();
      const key = name.toLowerCase();
      if (!names.has(key)) {
        names.set(key, {
          id: createId('ent'),
          name,
          canonicalName: name,
          type: 'ORGANIZATION',
          aliases: [],
          confidence: 0.86,
        });
      }
    }
  }
  return [...names.values()].slice(0, 16);
}

function buildRelationships(
  entities: DnaEntity[],
  documents: PipelineDocument[],
  facts: DnaFact[],
): DnaRelationship[] {
  const assetEntity = entities.find((item) => item.type === 'ASSET');
  if (!assetEntity) return [];
  const ownership = facts.find((fact) => fact.key === 'legal_ownership');
  return entities
    .filter((item) => item.type === 'ORGANIZATION')
    .slice(0, 5)
    .map((org) => {
      let type = 'RELATED_TO';
      let confidence = 0.7;
      let sourceDocumentId = documents[0]?.id;
      if (ownership && ownership.value.toLowerCase().includes(org.name.toLowerCase())) {
        type = 'LEGAL_OWNER_OF';
        confidence = ownership.confidence;
        sourceDocumentId = ownership.provenance[0]?.sourceDocumentId;
      } else if (/(spv|pte|sarl)/i.test(org.name)) {
        type = 'LEGAL_OWNER_OF';
        confidence = 0.8;
      }
      return {
        id: createId('rel'),
        fromEntityId: org.id,
        toEntityId: assetEntity.id,
        type,
        confidence,
        sourceDocumentId,
      };
    });
}

function buildTimeline(documents: PipelineDocument[]): DnaTimelineEvent[] {
  const events: DnaTimelineEvent[] = [];
  for (const document of documents) {
    const text = normalizeExtractionText(document.extractedText ?? '');
    const asOf = AS_OF_RE.exec(text);
    const date = (asOf?.[1] ?? text).match(DATE_RE)?.[0];
    if (!date) continue;
    events.push({
      id: createId('evt'),
      date,
      title: document.name.replace(/\.[a-z0-9]+$/i, ''),
      description: (text.split('\n').find((line) => line.trim().length > 12) ?? document.name).slice(0, 220),
      category:
        document.type === 'VALUATION_MEMO'
          ? 'VALUATION'
          : document.type === 'SPA' || document.type === 'TITLE_DEED'
            ? 'OWNERSHIP'
            : document.type === 'INSURANCE' || document.type === 'KYC' || document.type === 'LPA'
              ? 'LEGAL'
              : 'DOCUMENT',
      confidence: asOf ? 0.9 : 0.78,
      sourceDocumentId: document.id,
    });
  }
  return events.sort((a, b) => a.date.localeCompare(b.date));
}

function estimateValuation(
  asset: PipelineAsset,
  facts: DnaFact[],
  documents: PipelineDocument[],
): ValuationSummary {
  const valueFact = pickValueFact(facts);
  const amount = valueFact?.numericValue ?? fallbackValue(asset.assetClass);
  const currency = (valueFact?.currency ?? asset.currency) as CurrencyCode;
  const asOf = resolveValuationAsOf(facts, documents);
  const method =
    valueFact?.key === 'market_value'
      ? 'Independent valuation memo / appraisal extract'
      : valueFact?.key === 'nav'
        ? 'Fund NAV statement extract'
        : valueFact?.key === 'purchase_price'
          ? 'Acquisition price from purchase agreement (no later mark available)'
          : 'Class heuristic pending primary valuation memo';
  const notes: string[] = [];
  if (valueFact?.key === 'market_value') {
    notes.push('Primary mark taken from market value / fair value language.');
    const purchase = facts.find((fact) => fact.key === 'purchase_price' && fact.numericValue != null);
    if (purchase) notes.push(`Acquisition price was ${purchase.value}.`);
  } else if (valueFact?.key === 'nav') {
    notes.push('Primary mark taken from latest NAV.');
  } else if (valueFact) {
    notes.push('No market value found; falling back to purchase price.');
  } else {
    notes.push('No explicit value extracted; heuristic placeholder used.');
  }
  if ((valueFact?.provenance.length ?? 0) > 1) {
    notes.push('Mark corroborated across multiple source fragments.');
  }
  const ignoredNonMarket = documents.some(
    (document) =>
      document.type === 'INSURANCE' ||
      /(?:declared value|insured value|sum insured|replacement cost|reinstatement value|book value)/i.test(
        document.extractedText ?? '',
      ),
  );
  if (ignoredNonMarket && valueFact?.key === 'market_value') {
    notes.push('Insurance / replacement / book figures were ignored as market marks.');
  }
  return {
    amount,
    currency,
    method,
    asOf,
    low: Math.round(amount * 0.93),
    high: Math.round(amount * 1.07),
    confidence: valueFact?.confidence ?? 0.4,
    notes,
  };
}

function fallbackValue(assetClass: AssetClass): number {
  switch (assetClass) {
    case 'REAL_ESTATE':
      return 25_000_000;
    case 'PRIVATE_CREDIT':
      return 20_000_000;
    case 'AVIATION':
      return 18_000_000;
    case 'ART':
      return 2_500_000;
    case 'AGRICULTURE':
      return 8_000_000;
    case 'INFRASTRUCTURE':
      return 40_000_000;
    default:
      return 10_000_000;
  }
}

function estimateRisk(
  asset: PipelineAsset,
  documents: PipelineDocument[],
  facts: DnaFact[],
): RiskSummary {
  const types = new Set(documents.map((item) => item.type));
  const coverageScore = Math.max(10, 80 - types.size * 12);
  const ownershipClarity = facts.some((fact) => fact.key === 'legal_ownership') ? 18 : 55;
  const jurisdictionScore = asset.jurisdiction ? 24 : 48;
  const occupancy = facts.find((fact) => fact.key === 'occupancy' && fact.numericValue != null);
  const walt = facts.find((fact) => ['walt', 'wale'].includes(fact.key) && fact.numericValue != null);
  let incomeScore = 30;
  const flags: string[] = [];
  if (occupancy && (occupancy.numericValue ?? 100) < 95) {
    incomeScore += 8;
    flags.push(`Occupancy at ${occupancy.value}`);
  }
  if (walt && (walt.numericValue ?? 99) < 8) {
    incomeScore += 10;
    flags.push(`Lease duration ${walt.value} creates roll risk`);
  }
  if (!types.has('TITLE_DEED')) flags.push('Missing title / ownership evidence');
  if (!types.has('VALUATION_MEMO') && !types.has('FINANCIAL_STATEMENT')) {
    flags.push('No independent valuation memo / NAV pack');
  }
  if (types.size < 3) flags.push('Thin document coverage');
  const overall = Math.round((coverageScore + ownershipClarity + jurisdictionScore + incomeScore) / 4);
  const rating: RiskSummary['rating'] =
    overall < 30 ? 'LOW' : overall < 45 ? 'MODERATE' : overall < 60 ? 'ELEVATED' : 'HIGH';
  return {
    overall,
    rating,
    confidence: documents.length ? 0.88 : 0.4,
    flags,
    dimensions: [
      {
        key: 'document_coverage',
        label: 'Document coverage',
        score: coverageScore,
        rationale: `${types.size} distinct document types ingested for this asset.`,
      },
      {
        key: 'ownership_clarity',
        label: 'Ownership clarity',
        score: ownershipClarity,
        rationale: facts.some((fact) => fact.key === 'legal_ownership')
          ? 'Legal ownership language extracted.'
          : 'Ownership language was not confidently extracted.',
      },
      {
        key: 'jurisdiction',
        label: 'Jurisdiction & legal',
        score: jurisdictionScore,
        rationale: asset.jurisdiction
          ? `Jurisdiction recorded as ${asset.jurisdiction}.`
          : 'No jurisdiction recorded on the asset master.',
      },
      {
        key: 'income_durability',
        label: 'Income durability',
        score: incomeScore,
        rationale: 'Derived from occupancy and WALT/WALE extracts where available.',
      },
    ],
  };
}

export function runLocalPipeline(
  asset: PipelineAsset,
  documents: PipelineDocument[],
  options?: { facts?: DnaFact[] },
): AssetDnaEnvelope {
  const classified = documents.map((document) => ({
    ...document,
    type: classifyDocument(document.name, document.extractedText ?? '', document.type),
    extractedText: normalizeExtractionText(document.extractedText ?? ''),
  }));
  const facts = options?.facts ?? extractFacts(classified);
  const entities = extractEntities(asset, classified);
  const relationships = buildRelationships(entities, classified, facts);
  const timeline = buildTimeline(classified);
  const valuation = estimateValuation(asset, facts, classified);
  const risk = estimateRisk(asset, classified, facts);
  const coverage = Math.min(0.98, 0.4 + classified.length * 0.1);
  const provenance = facts.length
    ? facts.reduce((sum, fact) => sum + fact.confidence, 0) / facts.length
    : 0.4;
  const overall = Number((coverage * 0.4 + provenance * 0.6).toFixed(2));
  const valueFact = pickValueFact(facts);
  const summaryBits = [
    `${asset.name} intelligence envelope from ${classified.length} source document${classified.length === 1 ? '' : 's'}.`,
  ];
  if (valueFact) summaryBits.push(`Primary mark ${valueFact.value} (${valueFact.label.toLowerCase()}).`);
  if (risk.flags.length) summaryBits.push(`Risk ${risk.rating.toLowerCase()} with ${risk.flags.length} flag(s).`);

  const envelope: AssetDnaEnvelope = {
    assetId: asset.id,
    version: 1,
    generatedAt: new Date().toISOString(),
    summary: summaryBits.join(' '),
    facts,
    entities,
    relationships,
    timeline,
    valuation,
    risk,
    confidence: {
      overall,
      coverage: Number(coverage.toFixed(2)),
      provenance: Number(provenance.toFixed(2)),
    },
    sourceDocumentIds: classified.map((item) => item.id),
  };
  return attachProjection(envelope, asset.assetClass);
}

function formatMoney(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString('en-GB')}`;
}

export interface CopilotSection {
  title: string;
  body: string;
  kind?: 'metric' | 'detail' | 'note' | 'list';
}

export interface CopilotBriefing {
  title: string;
  headline: string;
  metric?: string;
  metricLabel?: string;
  confidence?: number;
  sections: CopilotSection[];
  disclaimer?: string;
}

export interface CopilotReply {
  answer: string;
  citations: Array<{ label: string; documentId?: string }>;
  briefing: CopilotBriefing;
}

function serializeBriefing(briefing: CopilotBriefing): string {
  const lines = [`${briefing.title}`, briefing.headline, ''];
  if (briefing.metric) {
    lines.push(`${briefing.metricLabel ?? 'Metric'}: ${briefing.metric}`);
  }
  for (const section of briefing.sections) {
    lines.push('', `${section.title}`, section.body);
  }
  if (briefing.confidence != null) {
    lines.push('', `Confidence: ${Math.round(briefing.confidence * 100)}%`);
  }
  if (briefing.disclaimer) {
    lines.push('', briefing.disclaimer);
  }
  return lines.join('\n').trim();
}

function replyFromBriefing(
  briefing: CopilotBriefing,
  citations: Array<{ label: string; documentId?: string }>,
): CopilotReply {
  return {
    briefing,
    citations,
    answer: serializeBriefing(briefing),
  };
}

export function answerCopilot(
  question: string,
  envelope?: AssetDnaEnvelope | null,
  documents: PipelineDocument[] = [],
): CopilotReply {
  const q = question.toLowerCase();
  const citations: Array<{ label: string; documentId?: string }> = [];

  if (!envelope) {
    return replyFromBriefing(
      {
        title: 'Intelligence briefing',
        headline: 'No Asset DNA snapshot is available for this question yet.',
        sections: [
          {
            title: 'Next step',
            body: 'Ingest documents and run the intelligence pipeline first, then ask again for valuation, risk, ownership or projections.',
            kind: 'note',
          },
        ],
      },
      citations,
    );
  }

  const wantsProjection = /(predict|forecast|future|forward|projected|projection|outlook)/.test(q);
  const wantsValue = /(value|valuation|worth|nav|price|mark)/.test(q);
  const wantsRisk = /(risk|concern|flag|lease)/.test(q);
  const wantsOwnership = /(owner|ownership|who owns|title)/.test(q);
  const wantsOccupancy = /occupancy/.test(q);
  const multi = [wantsProjection, wantsValue, wantsRisk, wantsOwnership, wantsOccupancy].filter(Boolean)
    .length > 1;

  const sections: CopilotSection[] = [];
  let title = 'Intelligence briefing';
  let headline = envelope.summary;
  let metric: string | undefined;
  let metricLabel: string | undefined;
  let confidence: number | undefined;

  if (wantsProjection && envelope.projection) {
    const y3 =
      envelope.projection.horizons.find((item) => item.years === 3) ?? envelope.projection.horizons[0];
    if (y3) {
      citations.push({ label: 'Forward valuation model' });
      const valueFact = pickValueFact(envelope.facts);
      if (valueFact) {
        citations.push({
          label: valueFact.label,
          documentId: valueFact.provenance[0]?.sourceDocumentId,
        });
      }
      title = 'Forward valuation';
      headline = `${y3.years}-year base mark from the CAPROV forward model.`;
      metric = formatMoney(y3.base, envelope.projection.currency);
      metricLabel = `${y3.years}y base mark`;
      confidence = y3.confidence;
      sections.push(
        {
          title: 'Scenario range',
          body: `Bear ${formatMoney(y3.bear, envelope.projection.currency)} · Bull ${formatMoney(y3.bull, envelope.projection.currency)}`,
          kind: 'detail',
        },
        {
          title: 'Model growth',
          body: `${(envelope.projection.assumptions.annualGrowthRate * 100).toFixed(1)}% p.a. from ${formatMoney(envelope.projection.baseAmount, envelope.projection.currency)}`,
          kind: 'detail',
        },
        {
          title: 'Drivers',
          body: envelope.projection.assumptions.drivers.join('\n'),
          kind: 'list',
        },
      );
    }
  }

  if (wantsValue && envelope.valuation) {
    const valueFact = pickValueFact(envelope.facts);
    if (valueFact) {
      citations.push({
        label: valueFact.label,
        documentId: valueFact.provenance[0]?.sourceDocumentId,
      });
    }
    const purchase = envelope.facts.find((fact) => fact.key === 'purchase_price');
    if (purchase && valueFact && valueFact.key !== 'purchase_price') {
      citations.push({
        label: purchase.label,
        documentId: purchase.provenance[0]?.sourceDocumentId,
      });
    }
    if (!metric) {
      title = 'Current valuation';
      headline = 'Primary mark taken from the Asset DNA envelope.';
      metric = formatMoney(envelope.valuation.amount, envelope.valuation.currency);
      metricLabel = 'Current mark';
      confidence = envelope.valuation.confidence;
    }
    sections.push(
      {
        title: 'As of',
        body: envelope.valuation.asOf.slice(0, 10),
        kind: 'detail',
      },
      {
        title: 'Method',
        body: envelope.valuation.method,
        kind: 'detail',
      },
    );
    if (purchase && valueFact && valueFact.key !== 'purchase_price') {
      sections.push({
        title: 'Acquisition price',
        body: purchase.value,
        kind: 'detail',
      });
    }
    if (envelope.valuation.notes?.length) {
      sections.push({
        title: 'Notes',
        body: envelope.valuation.notes.join('\n'),
        kind: 'note',
      });
    }
  }

  if (wantsRisk && envelope.risk) {
    citations.push({ label: 'Risk snapshot' });
    if (!metric) {
      title = 'Risk posture';
      headline = `Overall risk rated ${envelope.risk.rating}.`;
      metric = envelope.risk.rating;
      metricLabel = `Score ${envelope.risk.overall}/100`;
      confidence = envelope.risk.confidence;
    } else if (multi) {
      sections.unshift({
        title: 'Risk rating',
        body: `${envelope.risk.rating} (${envelope.risk.overall}/100)`,
        kind: 'metric',
      });
    }
    if (envelope.risk.dimensions[0]) {
      sections.push({
        title: 'Primary dimension',
        body: `${envelope.risk.dimensions[0].label}: ${envelope.risk.dimensions[0].rationale}`,
        kind: 'detail',
      });
    }
    sections.push({
      title: 'Flags',
      body: envelope.risk.flags.length ? envelope.risk.flags.join('\n') : 'No material flags recorded.',
      kind: 'list',
    });
  }

  if (wantsOwnership) {
    const ownership = envelope.facts.find((fact) => fact.key === 'legal_ownership');
    if (ownership) {
      citations.push({
        label: ownership.label,
        documentId: ownership.provenance[0]?.sourceDocumentId,
      });
      if (!metric) {
        title = 'Ownership';
        headline = 'Legal ownership extracted from source documents.';
        metric = ownership.value;
        metricLabel = 'Legal ownership';
        confidence = ownership.confidence;
      } else {
        sections.push({
          title: 'Legal ownership',
          body: ownership.value,
          kind: 'detail',
        });
      }
    }
  }

  if (wantsOccupancy) {
    const occupancy = envelope.facts.find((fact) => fact.key === 'occupancy');
    if (occupancy) {
      citations.push({
        label: occupancy.label,
        documentId: occupancy.provenance[0]?.sourceDocumentId,
      });
      if (!metric) {
        title = 'Occupancy';
        headline = 'Operating occupancy from the latest extracts.';
        metric = occupancy.value;
        metricLabel = 'Occupancy';
        confidence = occupancy.confidence;
      } else {
        sections.push({
          title: 'Occupancy',
          body: occupancy.value,
          kind: 'detail',
        });
      }
    }
  }

  if (sections.length || metric) {
    return replyFromBriefing(
      {
        title,
        headline,
        metric,
        metricLabel,
        confidence,
        sections,
        disclaimer: wantsProjection
          ? envelope.projection?.assumptions.disclaimer
          : 'Briefing derived from Asset DNA facts with source provenance. Not a legal opinion.',
      },
      citations,
    );
  }

  const keyword = q.split(' ').find((part) => part.length > 4);
  const keywordHits = documents.filter((document) =>
    (document.extractedText ?? '').toLowerCase().includes(keyword ?? '___'),
  );
  if (keywordHits[0]) {
    citations.push({ label: keywordHits[0].name, documentId: keywordHits[0].id });
  }
  return replyFromBriefing(
    {
      title: 'Asset overview',
      headline: envelope.summary,
      sections: [
        {
          title: 'Ask next',
          body: 'Try valuation, forward projection, risk, ownership, occupancy, timeline or a specific document.',
          kind: 'note',
        },
      ],
      disclaimer: 'Briefing derived from Asset DNA facts with source provenance. Not a legal opinion.',
    },
    citations,
  );
}
