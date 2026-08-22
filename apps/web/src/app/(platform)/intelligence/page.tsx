'use client';

import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { LlmModelPicker } from '@/components/intelligence/llm-model-picker';
import { api } from '@/lib/api';
import { confidenceLabel, formatDate, money, riskTone } from '@/lib/format';
import type { HydratedAsset, JobRow } from '@/lib/types';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

export default function IntelligencePage() {
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
          availability: Record<string, { available: boolean }>;
          selectedModelId: string;
        }>('/intelligence/models')
      ).data,
  });
  const assets = assetsQuery.data ?? [];
  const jobs = jobsQuery.data ?? [];
  const dnaReady = assets.filter((asset) => asset.latestDna).length;
  const awaitingDna = assets.length - dnaReady;
  const elevatedRisk = assets.filter((asset) =>
    ['ELEVATED', 'HIGH'].includes(asset.latestRisk?.payload.rating ?? ''),
  ).length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Intelligence"
        title="Review Asset DNA"
        description={`Versioned intelligence envelopes with source provenance, confidence, valuation and risk.${
          modelsQuery.data
            ? ` Active model: ${modelsQuery.data.selected.label} (${modelsQuery.data.selected.provider}${
                modelsQuery.data.availability[modelsQuery.data.selectedModelId]?.available
                  ? ', ready'
                  : ', key needed'
              }).`
            : ''
        }`}
        actions={
          <>
            <Link href="/documents">
              <Button variant="secondary">Add documents</Button>
            </Link>
            <Link href="/intelligence/copilot">
              <Button>Open Copilot</Button>
            </Link>
          </>
        }
      />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Assets', value: String(assets.length), hint: 'Assets available for review' },
          { label: 'DNA ready', value: String(dnaReady), hint: 'Assets with a current snapshot' },
          { label: 'Awaiting DNA', value: String(awaitingDna), hint: 'Usually waiting on source evidence' },
          { label: 'Elevated risk', value: String(elevatedRisk), hint: 'Needs human review before action' },
        ].map((stat) => (
          <Card key={stat.label} className="p-5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">{stat.label}</p>
            <p className="mt-4 font-display text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
              {stat.value}
            </p>
            <p className="mt-2 text-xs text-[var(--muted)]">{stat.hint}</p>
          </Card>
        ))}
      </section>
      <Card className="p-5">
        <div className="grid gap-3 md:grid-cols-3">
          {[
            '1. Open an asset card to inspect the latest extracted facts.',
            '2. Confirm valuation, risk, and provenance before trusting the result.',
            '3. Use Copilot only after the underlying Asset DNA looks correct.',
          ].map((step) => (
            <p key={step} className="text-sm leading-6 text-[var(--muted)]">
              {step}
            </p>
          ))}
        </div>
      </Card>
      <Card className="p-6">
        <LlmModelPicker />
      </Card>
      {assets.length ? (
        <div className="grid gap-4 md:grid-cols-3">
          {assets.map((asset) => (
            <Link key={asset.id} href={`/intelligence/dna/${asset.id}`}>
              <Card className="h-full p-5 transition hover:-translate-y-0.5 hover:border-[var(--ink)]/20">
                <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
                  {asset.latestDna ? `DNA v${asset.latestDna.version}` : 'No snapshot'}
                </p>
                <h2 className="mt-3 font-display text-lg font-semibold tracking-[-0.02em] text-[var(--ink)]">
                  {asset.name}
                </h2>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  {money(
                    asset.latestValuation?.payload.amount,
                    asset.latestValuation?.payload.currency ?? asset.currency,
                  )}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge tone={riskTone(asset.latestRisk?.payload.rating)}>
                    {asset.latestRisk?.payload.rating ?? 'n/a'}
                  </Badge>
                  <Badge>{confidenceLabel(asset.latestDna?.envelope.confidence.overall)} confidence</Badge>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card className="p-8">
          <h2 className="font-display text-xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
            No Asset DNA to review yet
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            The intelligence workflow becomes useful once you create an asset and upload source files. CAPROV can then
            build a snapshot your team can validate before relying on Copilot or execution workflows.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/assets/new">
              <Button>Create asset</Button>
            </Link>
            <Link href="/documents">
              <Button variant="secondary">Upload documents</Button>
            </Link>
          </div>
        </Card>
      )}
      <Card className="overflow-hidden">
        <div className="border-b border-[var(--line)]/80 px-4 py-5 sm:px-6">
          <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">Pipeline jobs</h2>
        </div>
        <div className="caprov-scroll">
        <table className="caprov-table w-full text-left text-sm">
          <thead className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3.5 font-medium sm:px-6">Job</th>
              <th className="px-3 py-3.5 font-medium">Type</th>
              <th className="px-3 py-3.5 font-medium">Status</th>
              <th className="px-4 py-3.5 font-medium sm:px-6">Created</th>
            </tr>
          </thead>
          <tbody>
            {jobs.length ? (
              jobs.map((job) => (
                <tr key={job.id} className="border-t border-[var(--line)]/80">
                  <td className="px-4 py-4 font-mono text-xs sm:px-6">{job.id}</td>
                  <td className="px-3 py-4">{job.type.replaceAll('_', ' ')}</td>
                  <td className="px-3 py-4">
                    <Badge tone={job.status === 'COMPLETED' ? 'ok' : job.status === 'FAILED' ? 'danger' : 'warn'}>
                      {job.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-4 text-[var(--muted)] sm:px-6">{formatDate(job.createdAt)}</td>
                </tr>
              ))
            ) : (
              <tr className="border-t border-[var(--line)]/80">
                <td colSpan={4} className="px-6 py-8 text-sm text-[var(--muted)]">
                  No pipeline jobs yet. Jobs appear here after document upload or intelligence processing.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </Card>
    </div>
  );
}
