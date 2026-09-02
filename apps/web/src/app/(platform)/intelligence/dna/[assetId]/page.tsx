'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfidenceBar } from '@/components/ui/confidence';
import { FactSummaryTable } from '@/components/intelligence/fact-summary-table';
import { api } from '@/lib/api';
import { confidenceLabel, formatDate, money, riskTone } from '@/lib/format';
import { sepoliaTxExplorerUrl } from '@/lib/explorer';
import type { TrustedAssetDnaSnapshot } from '@caprov/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function DnaExplorerPage() {
  const params = useParams<{ assetId: string }>();
  const queryClient = useQueryClient();
  const dnaQuery = useQuery({
    queryKey: ['dna', params.assetId],
    queryFn: async () =>
      (await api.get<TrustedAssetDnaSnapshot[]>(`/intelligence/assets/${params.assetId}/dna`)).data,
  });
  const run = useMutation({
    mutationFn: async () => api.post(`/intelligence/assets/${params.assetId}/run`, { type: 'FULL_PIPELINE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['dna', params.assetId] });
      await queryClient.invalidateQueries({ queryKey: ['asset', params.assetId] });
    },
  });

  const latest = dnaQuery.data?.[0];
  const envelope = latest?.envelope;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--gold)]">Asset DNA</p>
          <h1 className="mt-3 font-display text-[clamp(1.85rem,3vw,2.55rem)] font-semibold tracking-[-0.035em] text-[var(--ink)]">
            {envelope ? `Version ${latest?.version}` : 'No snapshot yet'}
          </h1>
          <p className="mt-3 max-w-3xl text-[15px] leading-7 text-[var(--muted)]">{envelope?.summary}</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/assets/${params.assetId}`}>
            <Button variant="secondary">Asset record</Button>
          </Link>
          <Button onClick={() => run.mutate()} disabled={run.isPending}>
            {run.isPending ? 'Rebuilding…' : 'Rebuild DNA'}
          </Button>
        </div>
      </div>

      {envelope ? (
        <>
          <section className="grid gap-4 md:grid-cols-3">
            <Card className="p-5">
              <ConfidenceBar value={envelope.confidence.overall} label="Overall" />
            </Card>
            <Card className="p-5">
              <ConfidenceBar value={envelope.confidence.coverage} label="Coverage" />
            </Card>
            <Card className="p-5">
              <ConfidenceBar value={envelope.confidence.provenance} label="Provenance" />
            </Card>
          </section>

          <Card className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Trusted intelligence layer</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Versioned DNA snapshot with content hashing and Ethereum Sepolia-backed provenance anchors.
                </p>
              </div>
              <Badge
                tone={
                  latest?.trust.verificationState === 'VERIFIED'
                    ? 'ok'
                    : latest?.trust.verificationState === 'PARTIAL'
                      ? 'warn'
                      : 'muted'
                }
              >
                {latest?.trust.verificationState ?? 'PENDING'}
              </Badge>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-[var(--line)] px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">Snapshot hash</p>
                <p className="mt-2 break-all font-mono text-xs text-[var(--ink)]">{latest?.contentHash}</p>
                <p className="mt-2 text-xs text-[var(--muted)]">
                  {latest?.hashAlgorithm.toUpperCase()} content hash for this DNA version.
                </p>
              </div>
              <div className="rounded-2xl border border-[var(--line)] px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">Anchor coverage</p>
                <p className="mt-2 text-sm text-[var(--ink)]">
                  {latest?.trust.anchoredDocumentCount ?? 0} of {envelope.sourceDocumentIds.length} source documents
                  anchored
                </p>
                {sepoliaTxExplorerUrl(
                  latest?.trust.snapshotAnchor?.txHash ?? latest?.trust.snapshotAnchor?.explorerUrl,
                ) ? (
                  <a
                    href={sepoliaTxExplorerUrl(
                      latest?.trust.snapshotAnchor?.txHash ?? latest?.trust.snapshotAnchor?.explorerUrl,
                    )}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-xs underline"
                  >
                    View on transaction explorer
                  </a>
                ) : (
                  <p className="mt-2 text-xs text-[var(--muted)]">
                    Snapshot anchor tx: {latest?.trust.snapshotAnchor?.txHash ?? 'Not anchored yet'}
                  </p>
                )}
              </div>
            </div>
          </Card>

          <div className="space-y-6">
            <FactSummaryTable
              title="Key extracted details"
              facts={envelope.facts.map((fact) => ({
                id: fact.id,
                key: fact.key,
                label: fact.label,
                value: fact.value,
                confidence: fact.confidence,
                fragment: fact.provenance[0]?.sourceFragment,
              }))}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-6">
              <h2 className="text-lg font-semibold">Entities & relationships</h2>
              <div className="mt-4 grid gap-3">
                {envelope.entities.map((entity) => (
                  <div key={entity.id} className="rounded-2xl border border-[var(--line)] px-4 py-3">
                    <p className="font-medium">{entity.name}</p>
                    <p className="text-xs text-[var(--muted)]">{entity.type}</p>
                  </div>
                ))}
                {envelope.relationships.map((rel) => (
                  <p key={rel.id} className="text-sm text-[var(--muted)]">
                    {rel.type.replaceAll('_', ' ')} · {confidenceLabel(rel.confidence)}
                  </p>
                ))}
              </div>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-6">
              <h2 className="text-lg font-semibold">Timeline</h2>
              <div className="mt-4 space-y-4">
                {envelope.timeline.map((event) => (
                  <div key={event.id} className="border-l-2 border-[var(--gold)] pl-4">
                    <p className="text-xs text-[var(--muted)]">{formatDate(event.date)}</p>
                    <p className="font-medium">{event.title}</p>
                    <p className="text-sm text-[var(--muted)]">{event.description}</p>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="p-6">
              <h2 className="text-lg font-semibold">Valuation & risk</h2>
              {envelope.valuation ? (
                <p className="mt-4 text-2xl font-semibold">
                  {money(envelope.valuation.amount, envelope.valuation.currency)}
                </p>
              ) : null}
              {envelope.risk ? (
                <div className="mt-4">
                  <Badge tone={riskTone(envelope.risk.rating)}>{envelope.risk.rating}</Badge>
                  <ul className="mt-3 list-disc pl-5 text-sm text-[var(--muted)]">
                    {envelope.risk.flags.map((flag) => (
                      <li key={flag}>{flag}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </Card>
          </div>

          {envelope.projection ? (
            <Card className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Forward valuation</h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Model {envelope.projection.model} ·{' '}
                    {(envelope.projection.assumptions.annualGrowthRate * 100).toFixed(1)}% p.a. base growth
                  </p>
                </div>
                <Badge tone="accent">{confidenceLabel(envelope.projection.confidence)} conf.</Badge>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                {envelope.projection.horizons.map((horizon) => (
                  <div key={horizon.years} className="rounded-2xl border border-[var(--line)] px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
                      {horizon.years}y · {formatDate(horizon.asOf)}
                    </p>
                    <p className="mt-2 text-xl font-semibold">
                      {money(horizon.base, envelope.projection!.currency)}
                    </p>
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      Bear {money(horizon.bear, envelope.projection!.currency)} · Bull{' '}
                      {money(horizon.bull, envelope.projection!.currency)}
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Band {money(horizon.low, envelope.projection!.currency)} –{' '}
                      {money(horizon.high, envelope.projection!.currency)}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-[var(--muted)]">
                {envelope.projection.assumptions.disclaimer}
              </p>
              <ul className="mt-3 list-disc pl-5 text-xs text-[var(--muted)]">
                {envelope.projection.assumptions.drivers.map((driver) => (
                  <li key={driver}>{driver}</li>
                ))}
              </ul>
            </Card>
          ) : null}
        </>
      ) : (
        <Card className="p-8 text-sm text-[var(--muted)]">
          Ingest documents on the asset, then rebuild DNA to generate a versioned intelligence envelope.
        </Card>
      )}
    </div>
  );
}
