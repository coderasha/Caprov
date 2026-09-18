import type { CurrencyCode, DnaFact, DocumentType } from '@caprov/types';
import { createId } from '../../infrastructure/database/ids';

export interface ExtractionDocument {
  id: string;
  name: string;
  type: DocumentType;
  extractedText?: string;
}

interface FieldSpec {
  key: string;
  label: string;
  regex: RegExp;
  baseConfidence: number;
}

interface Candidate extends DnaFact {
  documentType: DocumentType;
  documentAsOfMs: number;
  score: number;
}

const DATE_RE =
  /\b(?:\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}|\d{4}-\d{2}-\d{2})\b/gi;
const AS_OF_RE =
  /(?:as of|valuation date|effective date|appraisal date|reporting date|date)[:\s]+([^\n]+)/i;

/** Non-market money labels that must never become the primary mark. */
const NON_MARKET_VALUE_RE =
  /(?:declared value|insured value|sum insured|coverage amount|replacement cost|reinstatement value|book value)/i;

/** Expanded labeled-field patterns for private-asset packs. */
const FIELD_SPECS: FieldSpec[] = [
  {
    key: 'market_value',
    label: 'Market value',
    // Valuation conclusions often put the date and amount on separate lines.
    // Require an explicit money marker so "30 September 2026" is never read
    // as a USD 30 valuation.
    regex:
      /(?:indicative\s+)?market\s+value[\s\S]{0,120}?(?:assessed\s+at|is\s+assessed\s+at|concluded\s+at|:)\s*((?:₹\s*|INR\s*)[0-9][0-9,]*(?:\.[0-9]+)?(?:\s*(?:crore|lakh|million|billion|bn|m))?)/gi,
    baseConfidence: 0.94,
  },
  {
    key: 'market_value',
    label: 'Market value',
    regex:
      /(?:open market valuation|open market value|fair market value|current market value|estimated market value|appraised value|appraisal value|appraisal figure|gross asset value|\bgav\b|\bomv\b|market value|fair value)\s*[:\-]?\s*([^\n]+)/gi,
    baseConfidence: 0.94,
  },
  {
    key: 'nav',
    label: 'Latest NAV',
    regex: /(?:latest\s+nav|net asset value|nav)\s*:\s*([^\n]+)/gi,
    baseConfidence: 0.92,
  },
  {
    key: 'purchase_price',
    label: 'Purchase price',
    regex:
      /(?:purchase price|acquisition price|purchase consideration|consideration payable|consideration amount|total consideration)\s*[:\-]?\s*([^\n]+)/gi,
    baseConfidence: 0.96,
  },
  {
    key: 'legal_ownership',
    label: 'Legal ownership',
    regex:
      /(?:legal ownership|registered proprietor ownership)\s*[:\-]?\s*([^\n]+)/gi,
    baseConfidence: 0.97,
  },
  {
    key: 'legal_ownership',
    label: 'Legal ownership',
    regex: /ownership transferred\s*[:\-]?\s*([^\n]+)/gi,
    baseConfidence: 0.9,
  },
  {
    key: 'proprietor',
    label: 'Proprietor',
    regex:
      /(?:proprietor|registered proprietor|registered owner)\s*[:\-]?\s*([^\n]+)/gi,
    baseConfidence: 0.93,
  },
  {
    key: 'location',
    label: 'Location',
    regex: /(?:property|location|estate|address)\s*[:\-]?\s*([^\n]+)/gi,
    baseConfidence: 0.9,
  },
  {
    key: 'occupancy',
    label: 'Occupancy',
    regex: /(?:occupancy|let(?:ting)? rate|leased)\s*[:\-]?\s*([^\n]+)/gi,
    baseConfidence: 0.9,
  },
  {
    key: 'walt',
    label: 'WALT',
    regex: /(?:walt|weighted average lease term)\s*[:\-]?\s*([^\n]+)/gi,
    baseConfidence: 0.88,
  },
  {
    key: 'wale',
    label: 'WALE',
    regex: /(?:wale|weighted average lease expiry)\s*[:\-]?\s*([^\n]+)/gi,
    baseConfidence: 0.88,
  },
  {
    key: 'nia',
    label: 'Net internal area',
    regex: /(?:nia|net internal area)\s*[:\-]?\s*([^\n]+)/gi,
    baseConfidence: 0.88,
  },
  {
    key: 'commitment',
    label: 'Commitment',
    regex: /commitment\s*[:\-]?\s*([^\n]+)/gi,
    baseConfidence: 0.93,
  },
  {
    key: 'called_capital',
    label: 'Called capital',
    regex: /called capital\s*[:\-]?\s*([^\n]+)/gi,
    baseConfidence: 0.88,
  },
  {
    key: 'current_yield',
    label: 'Current yield',
    regex: /(?:current yield|running yield)\s*[:\-]?\s*([^\n]+)/gi,
    baseConfidence: 0.86,
  },
  {
    key: 'serial_number',
    label: 'Serial number',
    regex: /serial number\s*[:\-]?\s*([^\n]+)/gi,
    baseConfidence: 0.97,
  },
  {
    key: 'hectares',
    label: 'Estate size',
    regex: /(?:estate size|hectares)\s*[:\-]?\s*([^\n]+)/gi,
    baseConfidence: 0.92,
  },
  {
    key: 'airframe_hours',
    label: 'Airframe hours',
    regex: /airframe hours\s*[:\-]?\s*([^\n]+)/gi,
    baseConfidence: 0.9,
  },
  {
    key: 'cap_rate',
    label: 'Cap rate',
    regex:
      /(?:cap(?:itali[sz]ation)? rate|net initial yield|\bniy\b)\s*[:\-]?\s*([^\n]+)/gi,
    baseConfidence: 0.86,
  },
  {
    key: 'passing_rent',
    label: 'Passing rent',
    regex:
      /(?:passing rent|net rental income|annual rent)\s*[:\-]?\s*([^\n]+)/gi,
    baseConfidence: 0.86,
  },
];

const DOC_TYPE_BONUS: Partial<Record<DocumentType, number>> = {
  VALUATION_MEMO: 0.05,
  TITLE_DEED: 0.03,
  SPA: 0.02,
  LPA: 0.02,
  FINANCIAL_STATEMENT: 0.04,
  KYC: 0.01,
  INSURANCE: 0.01,
};

const MARK_DOC_PRIORITY: Partial<Record<DocumentType, number>> = {
  VALUATION_MEMO: 40,
  FINANCIAL_STATEMENT: 35,
  SPA: 10,
  TITLE_DEED: 8,
  OTHER: 5,
  INSURANCE: -50,
};

/** Normalize OCR / paste noise before pattern matching. */
export function normalizeExtractionText(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u2018\u2019\u201A]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u00ad/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function parseAmount(
  raw: string,
): { amount: number; currency: CurrencyCode } | null {
  const cleaned = raw
    .replace(/\((?:approximately|approx\.?|about)\)/gi, '')
    .trim();
  const moneyMatch =
    /(?:(USD|EUR|GBP|SGD|INR)|(\$)|(£)|(€)|(₹))\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(crore|lakh|million|billion|bn|m)?\b/i.exec(
      cleaned,
    );
  if (!moneyMatch?.[6]) {
    return null;
  }
  let amount = Number(moneyMatch[6].replace(/,/g, ''));
  const suffix = (moneyMatch[7] ?? '').toLowerCase();
  if (suffix === 'crore') amount *= 10_000_000;
  if (suffix === 'lakh') amount *= 100_000;
  if (suffix === 'million' || suffix === 'm') amount *= 1_000_000;
  if (suffix === 'billion' || suffix === 'bn') amount *= 1_000_000_000;
  // A written-out amount may follow the numeric amount in parentheses, e.g.
  // "$2,200,000 (Two Million...)". Only a suffix directly adjacent to the
  // numeric token is a scale instruction.
  const currency: CurrencyCode = moneyMatch[1]
    ? (moneyMatch[1].toUpperCase() as CurrencyCode)
    : moneyMatch[3]
      ? 'GBP'
      : moneyMatch[4]
        ? 'EUR'
        : moneyMatch[5]
          ? 'INR'
          : 'USD';
  return { amount, currency };
}

export function parsePercent(raw: string): number | undefined {
  const match = /(\d+(?:\.\d+)?)\s?%/.exec(raw);
  return match ? Number(match[1]) : undefined;
}

export function parseYears(raw: string): number | undefined {
  const match = /(\d+(?:\.\d+)?)\s*years?/i.exec(raw);
  return match ? Number(match[1]) : undefined;
}

function documentAsOfMs(text: string): number {
  const match = AS_OF_RE.exec(text);
  const date = match?.[1]?.match(DATE_RE)?.[0];
  if (!date) {
    return 0;
  }
  const iso = toIsoDate(date);
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

export function toIsoDate(raw: string): string {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T00:00:00.000Z`;
  }
  const natural =
    /^(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})$/i.exec(
      trimmed,
    );
  if (natural) {
    const months: Record<string, number> = {
      january: 0,
      february: 1,
      march: 2,
      april: 3,
      may: 4,
      june: 5,
      july: 6,
      august: 7,
      september: 8,
      october: 9,
      november: 10,
      december: 11,
    };
    const day = Number(natural[1]);
    const month = months[natural[2]!.toLowerCase()];
    const year = Number(natural[3]);
    if (month != null) {
      return new Date(Date.UTC(year, month, day)).toISOString();
    }
  }
  return new Date().toISOString();
}

/** Reject insurance / accounting substitutes that are not market marks. */
export function isNonMarketValueFragment(fragment: string): boolean {
  return NON_MARKET_VALUE_RE.test(fragment);
}

function scoreCandidate(
  key: string,
  confidence: number,
  documentType: DocumentType,
  documentAsOfMsValue: number,
): number {
  let score = confidence * 100;
  score += MARK_DOC_PRIORITY[documentType] ?? 0;
  if (['market_value', 'nav'].includes(key)) {
    score += documentAsOfMsValue / 1e13;
  }
  if (key === 'purchase_price' && documentType === 'SPA') {
    score += 20;
  }
  if (key === 'legal_ownership' && documentType === 'TITLE_DEED') {
    score += 25;
  }
  return score;
}

/**
 * High-accuracy fact extraction: normalize text, collect all candidates,
 * prefer valuation memos / newer as-of dates, consensus-boost agreeing marks,
 * and reject insurance declared values as market marks.
 */
export function extractFactsAccurate(
  documents: ExtractionDocument[],
): DnaFact[] {
  const candidatesByKey = new Map<string, Candidate[]>();

  for (const document of documents) {
    const text = normalizeExtractionText(document.extractedText ?? '');
    if (!text) continue;
    const bonus = DOC_TYPE_BONUS[document.type] ?? 0;
    const asOfMs = documentAsOfMs(text);

    for (const spec of FIELD_SPECS) {
      const regex = new RegExp(
        spec.regex.source,
        spec.regex.flags.includes('g')
          ? spec.regex.flags
          : `${spec.regex.flags}g`,
      );
      for (const match of text.matchAll(regex)) {
        const value = (match[1] ?? '').trim();
        if (!value || value.length < 1) continue;
        const fragment = match[0].slice(0, 180);

        if (
          spec.key === 'market_value' &&
          (document.type === 'INSURANCE' || isNonMarketValueFragment(fragment))
        ) {
          continue;
        }
        if (
          spec.key === 'nav' &&
          /nav statement/i.test(fragment) &&
          !/nav\s*:/i.test(fragment)
        ) {
          continue;
        }

        const parsed = parseAmount(value);
        if (
          ['market_value', 'nav', 'purchase_price'].includes(spec.key) &&
          !parsed
        ) {
          continue;
        }
        let confidence = Math.min(
          0.99,
          Number((spec.baseConfidence + bonus).toFixed(2)),
        );
        if (
          ['market_value', 'nav'].includes(spec.key) &&
          !['VALUATION_MEMO', 'FINANCIAL_STATEMENT'].includes(document.type)
        ) {
          confidence = Math.min(confidence, 0.78);
        }
        if (
          spec.key === 'purchase_price' &&
          !['SPA', 'TITLE_DEED'].includes(document.type)
        ) {
          confidence = Math.min(confidence, 0.8);
        }
        if (parsed && parsed.amount <= 0) {
          continue;
        }

        const fact: Candidate = {
          id: createId('fact'),
          key: spec.key,
          label: spec.label,
          value,
          numericValue:
            parsed?.amount ?? parsePercent(value) ?? parseYears(value),
          currency: parsed?.currency,
          unit:
            parsePercent(value) != null && !parsed
              ? '%'
              : parseYears(value) != null
                ? 'years'
                : undefined,
          confidence,
          provenance: [
            {
              sourceDocumentId: document.id,
              sourceFragment: fragment,
              confidence,
              observedAt: new Date().toISOString(),
            },
          ],
          documentType: document.type,
          documentAsOfMs: asOfMs,
          score: scoreCandidate(spec.key, confidence, document.type, asOfMs),
        };

        const list = candidatesByKey.get(spec.key) ?? [];
        list.push(fact);
        candidatesByKey.set(spec.key, list);
      }
    }
  }

  const best = new Map<string, DnaFact>();
  for (const [key, candidates] of candidatesByKey) {
    const ranked = [...candidates].sort(
      (a, b) => b.score - a.score || b.confidence - a.confidence,
    );
    let winner = ranked[0]!;

    if (
      ['market_value', 'nav', 'purchase_price'].includes(key) &&
      winner.numericValue != null
    ) {
      const agreeing = ranked.filter(
        (item) =>
          item.numericValue != null &&
          Math.abs(item.numericValue - winner.numericValue!) /
            winner.numericValue! <=
            0.02,
      );
      if (agreeing.length >= 2) {
        winner = {
          ...winner,
          confidence: Math.min(
            0.99,
            Number((winner.confidence + 0.03).toFixed(2)),
          ),
          provenance: [
            ...winner.provenance,
            ...agreeing.slice(1, 3).flatMap((item) => item.provenance),
          ],
        };
      }
    }

    best.set(key, winner);
  }

  const ownership = best.get('legal_ownership');
  const proprietor = best.get('proprietor');
  if (
    ownership &&
    proprietor &&
    /^\d+(?:\.\d+)?\s*%?$/.test(ownership.value.trim())
  ) {
    best.set('legal_ownership', {
      ...ownership,
      value: `${ownership.value.replace(/%/g, '').trim()}% ${proprietor.value}`,
      confidence: Math.max(ownership.confidence, proprietor.confidence),
    });
  }

  const order = FIELD_SPECS.map((item) => item.key);
  const orderedKeys: string[] = [];
  for (const key of order) {
    if (best.has(key) && !orderedKeys.includes(key)) orderedKeys.push(key);
  }
  for (const key of best.keys()) {
    if (!orderedKeys.includes(key)) orderedKeys.push(key);
  }
  return orderedKeys.map((key) => best.get(key)!);
}

export function pickValueFact(facts: DnaFact[]): DnaFact | undefined {
  for (const key of ['market_value', 'nav', 'purchase_price']) {
    const hit = facts.find(
      (fact) => fact.key === key && fact.numericValue != null,
    );
    if (hit) return hit;
  }
  return undefined;
}

export function resolveValuationAsOf(
  facts: DnaFact[],
  documents: ExtractionDocument[],
): string {
  const valueFact = pickValueFact(facts);
  const sourceId = valueFact?.provenance[0]?.sourceDocumentId;
  if (sourceId) {
    const source = documents.find((document) => document.id === sourceId);
    if (source?.extractedText) {
      const match = AS_OF_RE.exec(
        normalizeExtractionText(source.extractedText),
      );
      const date = match?.[1]?.match(DATE_RE)?.[0];
      if (date) {
        return toIsoDate(date);
      }
    }
  }
  for (const document of documents) {
    if (
      document.type !== 'VALUATION_MEMO' &&
      document.type !== 'FINANCIAL_STATEMENT'
    )
      continue;
    const match = AS_OF_RE.exec(
      normalizeExtractionText(document.extractedText ?? ''),
    );
    const date = match?.[1]?.match(DATE_RE)?.[0];
    if (date) return toIsoDate(date);
  }
  return new Date().toISOString();
}

export { AS_OF_RE, DATE_RE };
