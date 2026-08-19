'use client';

import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { assetClassLabel, formatDate, money, riskTone } from '@/lib/format';
import type { AuditRow, HydratedAsset, JobRow, PortfolioRow } from '@/lib/types';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

const workflowSteps = [
  {
    title: '1. Set up the asset',
    description: 'Create the asset record first so documents, valuation, and lending all stay connected.',
    href: '/assets/new',
    cta: 'Create asset',
  },
  {
    title: '2. Add source documents',
    description: 'Upload PDF or DOCX files and link them to the asset you want to review.',
    href: '/documents',
    cta: 'Upload documents',
  },
  {
    title: '3. Review Asset DNA',
    description: 'Check extracted details, valuation, risk, and provenance before taking action.',
    href: '/intelligence',
    cta: 'Open Asset DNA',
  },
  {
    title: '4. Use downstream workflows',
    description: 'Once the asset looks right, move into portfolios, listings, collateral, or lending.',
    href: '/collateral',
    cta: 'Use workflows',
  },
] as const;

export default function DashboardPage() {
  const assetsQuery = useQuery({
    queryKey: ['assets'],
    queryFn: async () => (await api.get<HydratedAsset[]>('/assets')).data,
  });
  const jobsQuery = useQuery({
    queryKey: ['jobs'],
    queryFn: async () => (await api.get<JobRow[]>('/intelligence/jobs')).data,
  });
  const auditQuery = useQuery({
    queryKey: ['audit'],
    queryFn: async () => (await api.get<AuditRow[]>('/audit?limit=8')).data,
  });
  const portfoliosQuery = useQuery({
    queryKey: ['portfolios'],
    queryFn: async () => (await api.get<PortfolioRow[]>('/portfolios')).data,
  });

  const assets = assetsQuery.data ?? [];
  const totalValue = assets.reduce((sum, asset) => sum + (asset.latestValuation?.payload.amount ?? 0), 0);
  const dnaReady = assets.filter((asset) => asset.latestDna).length;
  const elevated = assets.filter((asset) =>
    ['ELEVATED', 'HIGH'].includes(asset.latestRisk?.payload.rating ?? ''),
  ).length;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        eyebrow="Overview"
        title="Run the platform in four steps"
        description="Start with the asset, add documents, review the extracted intelligence, then move into portfolio or financing workflows."
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {workflowSteps.map((step) => (
          <Card key={step.title} className="p-5">
            <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--gold)]">{step.title}</p>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{step.description}</p>
            <Link
              href={step.href}
              className="mt-4 inline-flex text-sm font-medium text-[var(--ink)] underline underline-offset-4"
            >
              {step.cta}
            </Link>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
        {[
          { label: 'Marked value', value: money(totalValue, 'USD'), hint: 'Mixed-currency marks, unconverted' },
          { label: 'Assets', value: String(assets.length), hint: `${dnaReady} with DNA snapshots` },
          { label: 'Intelligence jobs', value: String(jobsQuery.data?.length ?? 0), hint: 'Completed and in-flight' },
          { label: 'Elevated risk', value: String(elevated), hint: 'Assets rated elevated or high' },
        ].map((stat) => (
          <Card key={stat.label} className="relative overflow-hidden p-5">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--gold)]/50 to-transparent" />
            <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">{stat.label}</p>
            <p className="mt-4 font-display text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
              {stat.value}
            </p>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{stat.hint}</p>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.45fr_0.85fr]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--line)]/80 px-6 py-5">
            <div>
              <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">Assets</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">Your current assets, values, and risk status</p>
            </div>
            <Link
              href="/assets"
              className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--gold)] hover:text-[var(--ink)]"
            >
              View all
            </Link>
          </div>
          <div className="caprov-scroll">
            <table className="caprov-table w-full text-left text-sm">
              <thead className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
                <tr>
                  <th className="px-6 py-3.5 font-medium">Name</th>
                  <th className="px-3 py-3.5 font-medium">Class</th>
                  <th className="px-3 py-3.5 font-medium">Value</th>
                  <th className="px-6 py-3.5 font-medium">Risk</th>
                </tr>
              </thead>
              <tbody>
                {assets.slice(0, 6).map((asset) => (
                  <tr key={asset.id} className="border-t border-[var(--line)]/80">
                    <td className="px-6 py-4">
                      <Link href={`/assets/${asset.id}`} className="font-medium text-[var(--ink)] hover:underline">
                        {asset.name}
                      </Link>
                      <p className="mt-0.5 text-xs text-[var(--muted)]">{asset.location ?? asset.jurisdiction}</p>
                    </td>
                    <td className="px-3 py-4 text-[var(--muted)]">{assetClassLabel[asset.assetClass]}</td>
                    <td className="px-3 py-4 font-medium tabular-nums">
                      {money(
                        asset.latestValuation?.payload.amount,
                        asset.latestValuation?.payload.currency ?? asset.currency,
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <Badge tone={riskTone(asset.latestRisk?.payload.rating)}>
                        {asset.latestRisk?.payload.rating ?? 'n/a'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="grid gap-6">
          <Card className="p-6">
            <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">Portfolios</h2>
            <div className="mt-5 grid gap-2.5">
              {(portfoliosQuery.data ?? []).map((portfolio) => (
                <Link
                  key={portfolio.id}
                  href={`/portfolios/${portfolio.id}`}
                  className="rounded-xl border border-[var(--line)]/90 bg-white/40 px-4 py-3.5 transition hover:border-[var(--ink)]/20 hover:bg-white/80"
                >
                  <p className="font-medium text-[var(--ink)]">{portfolio.name}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">{portfolio.holdingCount} holdings</p>
                </Link>
              ))}
            </div>
          </Card>
          <Card className="p-6">
            <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">Recent activity</h2>
            <div className="mt-5 space-y-4">
              {(auditQuery.data ?? []).map((event) => (
                <div key={event.id} className="border-l border-[var(--gold)]/50 pl-3">
                  <p className="text-sm font-medium text-[var(--ink)]">
                    {event.action.replaceAll('.', ' ')}
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {event.entityType} · {formatDate(event.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}
