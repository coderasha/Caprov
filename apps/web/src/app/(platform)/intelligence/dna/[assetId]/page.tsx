'use client';

import { DnaDecisionTable } from '@/components/intelligence/dna-decision-table';
import { FactSummaryTable } from '@/components/intelligence/fact-summary-table';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfidenceBar } from '@/components/ui/confidence';
import { api } from '@/lib/api';
import { confidenceLabel, formatDate, money, riskTone } from '@/lib/format';
import { sepoliaTxExplorerUrl } from '@/lib/explorer';
import type { HydratedAsset } from '@/lib/types';
import type { TrustedAssetDnaSnapshot } from '@caprov/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function DnaExplorerPage() {
  const params = useParams<{ assetId: string }>();
  const queryClient = useQueryClient();
  const assetQuery = useQuery({
    queryKey: ['asset', params.assetId],
    queryFn: async () => (await api.get<HydratedAsset>('/assets/' + params.assetId)).data,
  });
  const dnaQuery = useQuery({
    queryKey: ['dna', params.assetId],
    queryFn: async () =>
      (await api.get<TrustedAssetDnaSnapshot[]>('/intelligence/assets/' + params.assetId + '/dna')).data,
  });
  const run = useMutation({
    mutationFn: async () => api.post('/intelligence/assets/' + params.assetId + '/run', { type: 'FULL_PIPELINE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['dna', params.assetId] });
      await queryClient.invalidateQueries({ queryKey: ['asset', params.assetId] });
      await queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
  });

  const asset = assetQuery.data;
  const latest = dnaQuery.data?.[0];
  const envelope = latest?.envelope;
  const isLoading = assetQuery.isLoading || dnaQuery.isLoading;

  if (isLoading) {
    return <p className="text-sm text-[var(--muted)]">Loading Asset DNA…</p>;
  }

  if (!asset) {
    return <Card className="mx-auto max-w-3xl p-8 text-sm text-[var(--muted)]">This asset could not be found or is not available to your organization.</Card>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        eyebrow="Asset DNA · intelligence review"
        title={asset.name}
        description={envelope ? 'Review the current decision brief, then inspect evidence and provenance before relying on this snapshot.' : 'No intelligence snapshot is available yet. Add source evidence and run the pipeline to create one.'}
        actions={<><Link href={'/assets/' + asset.id}><Button variant="secondary">Asset record</Button></Link><Button onClick={() => run.mutate()} disabled={run.isPending}>{run.isPending ? 'Rebuilding…' : envelope ? 'Rebuild DNA' : 'Build DNA'}</Button></>}
      />

      {envelope && latest ? (
        <>
          <section className="overflow-hidden rounded-[1.25rem] bg-[var(--ink)] text-white shadow-[0_18px_45px_rgba(10,15,26,0.16)]">
            <div className="grid gap-6 px-5 py-6 sm:px-7 lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:px-8">
              <div>
                <div className="flex flex-wrap items-center gap-2"><Badge tone={latest.trust.verificationState === 'VERIFIED' ? 'ok' : latest.trust.verificationState === 'PARTIAL' ? 'warn' : 'muted'}>{latest.trust.verificationState}</Badge><span className="text-xs text-white/60">DNA version {latest.version} · generated {formatDate(latest.createdAt)}</span></div>
                <h2 className="mt-4 font-display text-2xl font-semibold tracking-[-0.03em] sm:text-[1.7rem]">Decision snapshot</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">{envelope.summary}</p>
              </div>
              <div className="grid grid-cols-3 divide-x divide-white/10 rounded-xl border border-white/10 bg-white/[0.06]">
                <div className="px-3 py-4 text-center"><p className="font-display text-2xl font-semibold">{Math.round(envelope.confidence.overall * 100)}%</p><p className="mt-1 text-[10px] uppercase tracking-[0.13em] text-white/55">Confidence</p></div>
                <div className="px-3 py-4 text-center"><p className="font-display text-2xl font-semibold">{envelope.sourceDocumentIds.length}</p><p className="mt-1 text-[10px] uppercase tracking-[0.13em] text-white/55">Sources</p></div>
                <div className="px-3 py-4 text-center"><p className="font-display text-2xl font-semibold">{envelope.risk?.overall ?? '—'}</p><p className="mt-1 text-[10px] uppercase tracking-[0.13em] text-white/55">Risk score</p></div>
              </div>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-3" aria-label="DNA confidence">
            <Card className="p-5"><ConfidenceBar value={envelope.confidence.overall} label="Overall confidence" /><p className="mt-3 text-xs text-[var(--muted)]">Confidence in the complete DNA snapshot.</p></Card>
            <Card className="p-5"><ConfidenceBar value={envelope.confidence.coverage} label="Evidence coverage" /><p className="mt-3 text-xs text-[var(--muted)]">How fully the source set covers core fields.</p></Card>
            <Card className="p-5"><ConfidenceBar value={envelope.confidence.provenance} label="Source provenance" /><p className="mt-3 text-xs text-[var(--muted)]">Traceability of extracted intelligence.</p></Card>
          </section>

          <DnaDecisionTable asset={asset} />

          <section className="grid gap-6 lg:grid-cols-2">
            <Card className="p-6">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--gold)]">Outlook</p>
              <h2 className="mt-1 font-display text-xl font-semibold tracking-[-0.025em] text-[var(--ink)]">Valuation & risk</h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl bg-[var(--paper)]/70 p-4"><p className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">Current value</p><p className="mt-2 text-xl font-semibold text-[var(--ink)]">{envelope.valuation ? money(envelope.valuation.amount, envelope.valuation.currency) : 'Not available'}</p><p className="mt-1 text-xs leading-5 text-[var(--muted)]">{envelope.valuation?.method ?? 'No valuation source available'}</p></div>
                <div className="rounded-xl bg-[var(--paper)]/70 p-4"><p className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">Risk posture</p><div className="mt-2">{envelope.risk ? <Badge tone={riskTone(envelope.risk.rating)}>{envelope.risk.rating} · {envelope.risk.overall}/100</Badge> : 'Not available'}</div><p className="mt-2 text-xs leading-5 text-[var(--muted)]">{envelope.risk?.flags.length ? envelope.risk.flags[0] : 'No review flags recorded'}</p></div>
              </div>
              {envelope.projection ? <div className="mt-5 border-t border-[var(--line)] pt-5"><p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted)]">Forward base case · {(envelope.projection.assumptions.annualGrowthRate * 100).toFixed(1)}% p.a.</p><div className="mt-3 grid grid-cols-3 gap-3">{envelope.projection.horizons.map((horizon) => <div key={horizon.years}><p className="text-xs text-[var(--muted)]">{horizon.years} year{horizon.years === 1 ? '' : 's'}</p><p className="mt-1 font-medium text-[var(--ink)]">{money(horizon.base, envelope.projection!.currency)}</p></div>)}</div></div> : null}
            </Card>

            <Card className="p-6">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--gold)]">Integrity</p>
              <h2 className="mt-1 font-display text-xl font-semibold tracking-[-0.025em] text-[var(--ink)]">Provenance & verification</h2>
              <dl className="mt-5 divide-y divide-[var(--line)]/80 text-sm">
                <div className="flex items-center justify-between gap-4 py-3"><dt className="text-[var(--muted)]">Verification status</dt><dd><Badge tone={latest.trust.verificationState === 'VERIFIED' ? 'ok' : latest.trust.verificationState === 'PARTIAL' ? 'warn' : 'muted'}>{latest.trust.verificationState}</Badge></dd></div>
                <div className="flex items-center justify-between gap-4 py-3"><dt className="text-[var(--muted)]">Anchored sources</dt><dd className="font-medium text-[var(--ink)]">{latest.trust.anchoredDocumentCount} of {envelope.sourceDocumentIds.length}</dd></div>
                <div className="py-3"><dt className="text-[var(--muted)]">Snapshot hash</dt><dd className="mt-2 break-all font-mono text-[11px] leading-5 text-[var(--ink)]">{latest.contentHash}</dd></div>
              </dl>
              {sepoliaTxExplorerUrl(latest.trust.snapshotAnchor?.txHash ?? latest.trust.snapshotAnchor?.explorerUrl) ? <a href={sepoliaTxExplorerUrl(latest.trust.snapshotAnchor?.txHash ?? latest.trust.snapshotAnchor?.explorerUrl)} target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm font-medium text-[var(--teal)] underline underline-offset-4">View snapshot anchor</a> : <p className="mt-4 text-xs text-[var(--muted)]">No transaction explorer link is available for this snapshot.</p>}
            </Card>
          </section>

          <details className="group rounded-[1.25rem] border border-[var(--line)] bg-[var(--card)] shadow-[var(--shadow-soft)]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-5 sm:px-6"><div><p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--gold)]">Supporting intelligence</p><p className="mt-1 font-medium text-[var(--ink)]">View extracted facts, entities, and timeline</p></div><span className="text-sm text-[var(--muted)] transition group-open:rotate-45">+</span></summary>
            <div className="space-y-6 border-t border-[var(--line)] px-5 py-6 sm:px-6">
              <FactSummaryTable title="All extracted facts" facts={envelope.facts.map((fact) => ({ id: fact.id, key: fact.key, label: fact.label, value: fact.value, fragment: fact.provenance[0]?.sourceFragment }))} />
              <div className="grid gap-6 lg:grid-cols-2">
                <Card className="p-5"><h2 className="font-semibold text-[var(--ink)]">Key entities</h2><div className="mt-4 flex flex-wrap gap-2">{envelope.entities.map((entity) => <Badge key={entity.id} tone="muted">{entity.name} · {entity.type}</Badge>)}</div></Card>
                <Card className="p-5"><h2 className="font-semibold text-[var(--ink)]">Timeline</h2><div className="mt-4 space-y-4">{envelope.timeline.length ? envelope.timeline.map((event) => <div key={event.id} className="border-l-2 border-[var(--gold)] pl-3"><p className="text-xs text-[var(--muted)]">{formatDate(event.date)}</p><p className="mt-1 text-sm font-medium text-[var(--ink)]">{event.title}</p><p className="mt-1 text-xs leading-5 text-[var(--muted)]">{event.description}</p></div>) : <p className="text-sm text-[var(--muted)]">No timeline events extracted.</p>}</div></Card>
              </div>
            </div>
          </details>
        </>
      ) : (
        <Card className="p-8"><h2 className="font-display text-xl font-semibold tracking-[-0.025em] text-[var(--ink)]">Build the first intelligence snapshot</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">Add source documents to this asset, then run Asset DNA. The resulting snapshot will capture extracted facts, valuation, risk, confidence, and provenance.</p><div className="mt-5 flex flex-wrap gap-3"><Link href={'/assets/' + asset.id}><Button variant="secondary">Open asset documents</Button></Link><Button onClick={() => run.mutate()} disabled={run.isPending}>{run.isPending ? 'Building…' : 'Build DNA'}</Button></div></Card>
      )}
    </div>
  );
}
