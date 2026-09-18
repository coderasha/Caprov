import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { confidenceLabel, formatDate, money, riskTone } from '@/lib/format';
import type { HydratedAsset } from '@/lib/types';
import type { ReactNode } from 'react';

type DetailRow = {
  label: string;
  value: ReactNode;
  evidence: string;
};

type DetailSection = {
  title: string;
  description: string;
  rows: DetailRow[];
};

function labelFor(key: string) {
  return key
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function DnaDecisionTable({ asset }: { asset: HydratedAsset }) {
  const dna = asset.latestDna?.envelope;
  const valuation = asset.latestValuation?.payload ?? dna?.valuation;
  const risk = asset.latestRisk?.payload ?? dna?.risk;
  const extractedFacts = (dna?.facts ?? []).filter(
    (fact) => !['market_value', 'nav', 'purchase_price'].includes(fact.key),
  );

  const sections: DetailSection[] = [
    {
      title: 'Asset profile',
      description: 'Master-record details and source coverage.',
      rows: [
        {
          label: 'Classification',
          value: asset.assetClass.replaceAll('_', ' '),
          evidence: 'Asset master record',
        },
        {
          label: 'Location & jurisdiction',
          value: [asset.location, asset.jurisdiction].filter(Boolean).join(' · ') || 'Not recorded',
          evidence: 'Asset master record',
        },
        {
          label: 'Source evidence',
          value: asset.documentCount + ' current ' + (asset.documentCount === 1 ? 'document' : 'documents'),
          evidence: dna
            ? dna.sourceDocumentIds.length + ' document' + (dna.sourceDocumentIds.length === 1 ? '' : 's') + ' included in DNA v' + asset.latestDna?.version
            : 'No DNA snapshot',
        },
      ],
    },
    {
      title: 'Valuation',
      description: 'Latest mark and the method used to derive it.',
      rows: [
        {
          label: 'Current recorded value',
          value: valuation ? money(valuation.amount, valuation.currency) : 'No valuation extracted',
          evidence: valuation
            ? valuation.method + (valuation.asOf ? ' · As of ' + formatDate(valuation.asOf) : '')
            : 'Upload a valuation source or run Asset DNA',
        },
        ...(valuation?.low != null || valuation?.high != null
          ? [
              {
                label: 'Value range',
                value:
                  (valuation.low != null ? money(valuation.low, valuation.currency) : '—') +
                  ' – ' +
                  (valuation.high != null ? money(valuation.high, valuation.currency) : '—'),
                evidence: confidenceLabel(valuation.confidence) + ' confidence',
              },
            ]
          : []),
      ],
    },
    {
      title: 'Risk & data quality',
      description: 'Automated review signals and confidence in the current snapshot.',
      rows: [
        {
          label: 'Risk assessment',
          value: risk ? <Badge tone={riskTone(risk.rating)}>{risk.rating} · {risk.overall}/100</Badge> : 'No risk assessment',
          evidence: risk ? confidenceLabel(risk.confidence) + ' confidence' : 'Run Asset DNA to calculate',
        },
        {
          label: 'DNA confidence',
          value: dna ? Math.round(dna.confidence.overall * 100) + '% overall' : 'No DNA snapshot',
          evidence: dna
            ? 'Coverage ' + Math.round(dna.confidence.coverage * 100) + '% · Provenance ' + Math.round(dna.confidence.provenance * 100) + '%'
            : '—',
        },
        ...(risk?.flags ?? []).map((flag) => ({
          label: 'Review flag',
          value: <Badge tone="warn">Attention</Badge>,
          evidence: flag,
        })),
      ],
    },
    ...(extractedFacts.length
      ? [
          {
            title: 'Key extracted facts',
            description: 'Structured facts retained with their closest source excerpt.',
            rows: extractedFacts.map((fact) => ({
              label: fact.label ?? labelFor(fact.key),
              value: fact.value,
              evidence:
                fact.provenance[0]?.sourceFragment ??
                confidenceLabel(fact.confidence) + ' confidence; source excerpt unavailable',
            })),
          },
        ]
      : []),
  ];

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-[var(--line)]/80 px-5 py-5 sm:px-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--gold)]">Decision brief</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold tracking-[-0.025em] text-[var(--ink)]">Key Asset DNA information</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Decision-relevant data, clearly separated from its supporting evidence.</p>
          </div>
          {dna ? <Badge tone="ink">DNA v{asset.latestDna?.version}</Badge> : null}
        </div>
      </div>

      <div className="divide-y divide-[var(--line)]/80">
        {sections.map((section) => (
          <section key={section.title} className="px-5 py-5 sm:px-6">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-[var(--ink)]">{section.title}</h3>
              <p className="mt-0.5 text-xs text-[var(--muted)]">{section.description}</p>
            </div>
            <div className="caprov-scroll rounded-xl border border-[var(--line)]/80">
              <table className="min-w-[680px] w-full text-left text-sm">
                <thead className="bg-[var(--paper)]/70 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
                  <tr>
                    <th className="w-[27%] px-4 py-3 font-medium">Information</th>
                    <th className="w-[30%] px-4 py-3 font-medium">Current value</th>
                    <th className="px-4 py-3 font-medium">Basis / evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map((row) => (
                    <tr key={row.label + row.evidence} className="border-t border-[var(--line)]/70 align-top">
                      <td className="px-4 py-3.5 font-medium text-[var(--ink)]">{row.label}</td>
                      <td className="px-4 py-3.5 text-[var(--ink)]">{row.value}</td>
                      <td className="px-4 py-3.5 leading-5 text-[var(--muted)]">{row.evidence}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </Card>
  );
}
