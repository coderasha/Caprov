'use client';

import { LlmModelPicker } from '@/components/intelligence/llm-model-picker';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { confidenceLabel, formatDate, money, riskTone } from '@/lib/format';
import type { HydratedAsset, JobRow } from '@/lib/types';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo, useState } from 'react';

type ReviewFilter = 'ALL' | 'REVIEW' | 'READY';

export default function IntelligencePage() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ReviewFilter>('ALL');
  const assetsQuery = useQuery({
    queryKey: ['assets'],
    queryFn: async () => (await api.get<HydratedAsset[]>('/assets')).data,
  });
  const jobsQuery = useQuery({
    queryKey: ['jobs'],
    queryFn: async () => (await api.get<JobRow[]>('/intelligence/jobs')).data,
  });
  const modelsQuery = useQuery({
    queryKey: ['llm-models'],
    queryFn: async () =>
      (
        await api.get<{
          selected: { label: string; provider: string };
          dnaSelected: { label: string; provider: string };
          availability: Record<string, { available: boolean }>;
          selectedModelId: string;
          dnaSelectedModelId: string;
        }>('/intelligence/models')
      ).data,
  });

  const assets = assetsQuery.data ?? [];
  const jobs = jobsQuery.data ?? [];
  const dnaReady = assets.filter((asset) => asset.latestDna).length;
  const awaitingDna = assets.length - dnaReady;
  const elevatedRisk = assets.filter((asset) => ['ELEVATED', 'HIGH'].includes(asset.latestRisk?.payload.rating ?? '')).length;
  const reviewCount = assets.filter((asset) => !asset.latestDna || ['ELEVATED', 'HIGH'].includes(asset.latestRisk?.payload.rating ?? '')).length;
  const isDnaAvailable = modelsQuery.data?.availability[modelsQuery.data.dnaSelectedModelId]?.available;
  const visibleAssets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return assets.filter((asset) => {
      const needsReview = !asset.latestDna || ['ELEVATED', 'HIGH'].includes(asset.latestRisk?.payload.rating ?? '');
      const matchesFilter = filter === 'ALL' || (filter === 'REVIEW' ? needsReview : Boolean(asset.latestDna) && !needsReview);
      return matchesFilter && (!normalizedQuery || asset.name.toLowerCase().includes(normalizedQuery));
    });
  }, [assets, filter, query]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        eyebrow="Intelligence workspace"
        title="Asset intelligence, ready for review"
        description="Validate the evidence behind each Asset DNA snapshot before it informs a decision or a Copilot briefing."
        actions={<><Link href="/documents"><Button variant="secondary">Add evidence</Button></Link><Link href="/intelligence/copilot"><Button>Open Copilot</Button></Link></>}
      />

      <section className="overflow-hidden rounded-[1.25rem] bg-[var(--ink)] text-white shadow-[0_18px_45px_rgba(10,15,26,0.16)]">
        <div className="grid gap-7 px-5 py-6 sm:px-7 lg:grid-cols-[1.25fr_0.75fr] lg:items-center lg:px-8 lg:py-7">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-white/65"><span className="h-2 w-2 rounded-full bg-[#6ed1a5] shadow-[0_0_0_4px_rgba(110,209,165,0.12)]" />Intelligence pipeline is online</div>
            <h2 className="mt-4 font-display text-2xl font-semibold tracking-[-0.03em] sm:text-[1.7rem]">Start with the review queue.</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/65">{reviewCount ? `${reviewCount} asset${reviewCount === 1 ? '' : 's'} need${reviewCount === 1 ? 's' : ''} attention before their intelligence can be treated as decision-ready.` : 'Every asset has a current, reviewable intelligence snapshot.'}</p>
          </div>
          <div className="grid grid-cols-3 divide-x divide-white/10 rounded-xl border border-white/10 bg-white/[0.06]">
            {[{ label: 'In review', value: reviewCount }, { label: 'Current DNA', value: dnaReady }, { label: 'High risk', value: elevatedRisk }].map((item) => <div key={item.label} className="px-3 py-4 text-center sm:px-4"><p className="font-display text-2xl font-semibold tracking-[-0.03em]">{item.value}</p><p className="mt-1 text-[10px] uppercase tracking-[0.13em] text-white/55">{item.label}</p></div>)}
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Intelligence overview">
        {[{ label: 'Assets tracked', value: assets.length, hint: 'Available for intelligence review' }, { label: 'Current snapshots', value: dnaReady, hint: 'Asset DNA is available' }, { label: 'Evidence needed', value: awaitingDna, hint: 'Upload or process source files' }, { label: 'Risk flagged', value: elevatedRisk, hint: 'Requires human assessment' }].map((stat) => <Card key={stat.label} className="p-5"><p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--muted)]">{stat.label}</p><p className="mt-3 font-display text-3xl font-semibold tracking-[-0.04em] text-[var(--ink)]">{stat.value}</p><p className="mt-2 text-xs text-[var(--muted)]">{stat.hint}</p></Card>)}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <Card className="overflow-hidden">
          <div className="border-b border-[var(--line)]/80 px-5 py-5 sm:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div><p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--gold)]">Review queue</p><h2 className="mt-1 font-display text-xl font-semibold tracking-[-0.025em] text-[var(--ink)]">Asset DNA snapshots</h2><p className="mt-1 text-sm text-[var(--muted)]">Open an asset to inspect facts, provenance, valuation, and risk.</p></div>
              <label className="relative block lg:w-56"><span className="sr-only">Search assets</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search assets" className="w-full rounded-xl border border-[var(--line)] bg-white px-3.5 py-2.5 text-sm outline-none transition placeholder:text-[var(--muted)]/70 focus:border-[var(--teal)] focus:ring-2 focus:ring-[var(--teal)]/10" /></label>
            </div>
            <div className="mt-5 flex flex-wrap gap-2" aria-label="Filter asset snapshots">
              {([['ALL', `All assets (${assets.length})`], ['REVIEW', `Needs review (${reviewCount})`], ['READY', `Decision-ready (${Math.max(dnaReady - elevatedRisk, 0)})`]] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${filter === value ? 'bg-[var(--ink)] text-white' : 'bg-[var(--paper-2)] text-[var(--muted)] hover:bg-[var(--gold-soft)] hover:text-[var(--ink)]'}`}>{label}</button>)}
            </div>
          </div>
          <div className="divide-y divide-[var(--line)]/75">
            {assetsQuery.isLoading ? <p className="px-6 py-10 text-sm text-[var(--muted)]">Loading intelligence workspace…</p> : null}
            {visibleAssets.map((asset) => {
              const needsReview = !asset.latestDna || ['ELEVATED', 'HIGH'].includes(asset.latestRisk?.payload.rating ?? '');
              return <Link key={asset.id} href={`/intelligence/dna/${asset.id}`} className="group block px-5 py-4 transition hover:bg-[var(--gold-soft)]/30 sm:px-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-medium text-[var(--ink)] group-hover:text-[var(--teal)]">{asset.name}</h3><Badge tone={needsReview ? 'warn' : 'ok'}>{needsReview ? 'Review needed' : 'Ready'}</Badge></div><p className="mt-1 text-xs text-[var(--muted)]">{asset.assetClass.replaceAll('_', ' ')} · {asset.documentCount} source {asset.documentCount === 1 ? 'file' : 'files'} · {asset.latestDna ? `DNA v${asset.latestDna.version}` : 'No snapshot yet'}</p></div><div className="flex shrink-0 items-center justify-between gap-4 sm:justify-end"><div className="text-left sm:text-right"><p className="text-sm font-medium text-[var(--ink)]">{money(asset.latestValuation?.payload.amount, asset.latestValuation?.payload.currency ?? asset.currency)}</p><p className="mt-0.5 text-xs text-[var(--muted)]">{asset.latestDna ? `${confidenceLabel(asset.latestDna.envelope.confidence.overall)} confidence` : 'Awaiting extraction'}</p></div><Badge tone={riskTone(asset.latestRisk?.payload.rating)}>{asset.latestRisk?.payload.rating ?? 'No risk'}</Badge></div></div></Link>;
            })}
            {!assetsQuery.isLoading && !visibleAssets.length ? <p className="px-6 py-10 text-sm text-[var(--muted)]">No assets match this view. Try another filter or clear your search.</p> : null}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-5"><p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--gold)]">Model status</p><h2 className="mt-2 font-display text-lg font-semibold tracking-[-0.02em] text-[var(--ink)]">Configured for your team</h2><div className="mt-4 space-y-3 text-sm"><div className="flex items-start justify-between gap-3"><span className="text-[var(--muted)]">Copilot</span><span className="text-right font-medium text-[var(--ink)]">{modelsQuery.data?.selected.label ?? 'Loading…'}</span></div><div className="flex items-start justify-between gap-3"><span className="text-[var(--muted)]">DNA extraction</span><span className="text-right font-medium text-[var(--ink)]">{modelsQuery.data?.dnaSelected.label ?? 'Loading…'}</span></div><div className="flex items-center gap-2 border-t border-[var(--line)] pt-3 text-xs text-[var(--muted)]"><span className={`h-1.5 w-1.5 rounded-full ${isDnaAvailable ? 'bg-[var(--ok)]' : 'bg-[var(--warn)]'}`} />{isDnaAvailable ? 'DNA model is ready to use' : 'DNA model needs a provider key'}</div></div></Card>
          <Card className="p-5"><p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--gold)]">A reliable review</p><ol className="mt-3 space-y-3 text-sm leading-5 text-[var(--muted)]"><li><span className="mr-2 font-mono text-xs text-[var(--gold)]">01</span>Confirm the extracted facts against their source evidence.</li><li><span className="mr-2 font-mono text-xs text-[var(--gold)]">02</span>Resolve valuation or risk flags with the relevant owner.</li><li><span className="mr-2 font-mono text-xs text-[var(--gold)]">03</span>Use Copilot for synthesis once the snapshot is sound.</li></ol></Card>
        </div>
      </section>

      <details className="group rounded-[1.25rem] border border-[var(--line)] bg-[var(--card)] shadow-[var(--shadow-soft)]"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-5 sm:px-6"><div><p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--gold)]">Workspace settings</p><p className="mt-1 font-medium text-[var(--ink)]">Manage AI model preferences</p></div><span className="text-sm text-[var(--muted)] transition group-open:rotate-45">+</span></summary><div className="grid gap-6 border-t border-[var(--line)] px-5 py-6 sm:px-6 xl:grid-cols-2"><LlmModelPicker /><LlmModelPicker purpose="DNA" /></div></details>

      <Card className="overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)]/80 px-5 py-5 sm:px-6"><div><p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--gold)]">Activity</p><h2 className="mt-1 font-display text-lg font-semibold tracking-[-0.02em] text-[var(--ink)]">Pipeline jobs</h2></div><span className="text-xs text-[var(--muted)]">{jobs.length} recent {jobs.length === 1 ? 'job' : 'jobs'}</span></div><div className="caprov-scroll"><table className="caprov-table w-full text-left text-sm"><thead className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]"><tr><th className="px-4 py-3.5 font-medium sm:px-6">Job</th><th className="px-3 py-3.5 font-medium">Type</th><th className="px-3 py-3.5 font-medium">Status</th><th className="px-4 py-3.5 font-medium sm:px-6">Started</th></tr></thead><tbody>{jobs.length ? jobs.slice(0, 8).map((job) => <tr key={job.id} className="border-t border-[var(--line)]/80"><td className="px-4 py-4 font-mono text-xs sm:px-6">{job.id}</td><td className="px-3 py-4 capitalize">{job.type.replaceAll('_', ' ').toLowerCase()}</td><td className="px-3 py-4"><Badge tone={job.status === 'COMPLETED' ? 'ok' : job.status === 'FAILED' ? 'danger' : 'warn'}>{job.status}</Badge></td><td className="px-4 py-4 text-[var(--muted)] sm:px-6">{formatDate(job.createdAt)}</td></tr>) : <tr className="border-t border-[var(--line)]/80"><td colSpan={4} className="px-6 py-8 text-sm text-[var(--muted)]">No pipeline activity yet. Jobs appear after a document upload or an intelligence run.</td></tr>}</tbody></table></div></Card>
    </div>
  );
}
