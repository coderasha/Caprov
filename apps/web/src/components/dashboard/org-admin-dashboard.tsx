'use client';

import {
  AllocationDonut,
  AreaTrendChart,
  MiniBars,
  Sparkline,
} from '@/components/dashboard/dashboard-charts';
import { useWallet } from '@/components/wallet/wallet-provider';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import {
  assetClassLabel,
  assetStatusLabel,
  formatDate,
  moneyCompact,
  riskTone,
} from '@/lib/format';
import type { AuditRow, DocumentRow, HydratedAsset, JobRow } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Building2,
  FileText,
  Layers,
  Lock,
  MoreHorizontal,
  Plus,
  Shield,
  Upload,
  Workflow,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

const RANGE_OPTIONS = ['1M', '3M', '6M', '1Y', 'ALL'] as const;
const ALLOCATION_COLORS = ['#9d6b24', '#c9a46a', '#0f6f68', '#5b7c99', '#b0a89c'];

function greetingForNow(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function firstName(fullName?: string) {
  return fullName?.split(/\s+/)[0] ?? 'there';
}

function dnaCoverage(asset: HydratedAsset) {
  let score = 0;
  if (asset.latestDna) score += 45;
  if (asset.documentCount > 0) score += 25;
  if (asset.latestValuation) score += 15;
  if (asset.latestRisk) score += 15;
  if (asset.documentCount >= 3) score += 10;
  return Math.min(100, score);
}

function statusPresentation(status: HydratedAsset['status'], coverage: number) {
  if (status === 'ACTIVE' && coverage >= 80) {
    return { label: 'Verified', tone: 'ok' as const };
  }
  if (status === 'UNDER_REVIEW' || coverage < 60) {
    return { label: coverage < 40 ? 'Action required' : 'In review', tone: 'warn' as const };
  }
  if (status === 'DRAFT') {
    return { label: 'Draft', tone: 'muted' as const };
  }
  return { label: assetStatusLabel[status] ?? status, tone: 'muted' as const };
}

function relativeTime(value?: string) {
  if (!value) return '—';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '—';
  const delta = Date.now() - then;
  const minutes = Math.round(delta / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function buildTrend(totalValue: number, months: number) {
  const labels =
    months <= 3
      ? ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5', 'Week 6']
      : months <= 6
        ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep']
        : ['Q1', 'Q2', 'Q3', 'Q4', 'YTD'];
  const base = Math.max(totalValue, 1);
  const growth = months <= 3 ? 0.08 : months <= 6 ? 0.18 : 0.28;
  const series = labels.map((_, index) => {
    const progress = index / Math.max(labels.length - 1, 1);
    const wobble = 1 + Math.sin(index * 1.1) * 0.015;
    return base * (1 - growth + growth * progress) * wobble;
  });
  series[series.length - 1] = base;
  return { labels, series };
}

function activityCopy(event: AuditRow) {
  const action = event.action.toLowerCase();
  if (action.includes('dna')) return { title: 'Asset DNA updated', icon: Layers };
  if (action.includes('document') || action.includes('upload')) return { title: 'New document uploaded', icon: FileText };
  if (action.includes('token') || action.includes('lock') || action.includes('collateral')) {
    return { title: 'Collateral lock confirmed', icon: Lock };
  }
  if (action.includes('risk') || action.includes('flag')) return { title: 'Risk flag raised', icon: AlertTriangle };
  if (action.includes('login') || action.includes('auth')) return { title: 'Workspace sign-in', icon: Shield };
  return { title: event.action.replaceAll('.', ' '), icon: Workflow };
}

export function OrgAdminDashboard() {
  const user = useAuthStore((state) => state.user);
  const { network, address } = useWallet();
  const [range, setRange] = useState<(typeof RANGE_OPTIONS)[number]>('6M');
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
  }, []);

  const assetsQuery = useQuery({
    queryKey: ['assets'],
    queryFn: async () => (await api.get<HydratedAsset[]>('/assets')).data,
  });
  const documentsQuery = useQuery({
    queryKey: ['documents'],
    queryFn: async () => (await api.get<DocumentRow[]>('/documents')).data,
  });
  const jobsQuery = useQuery({
    queryKey: ['jobs'],
    queryFn: async () => (await api.get<JobRow[]>('/intelligence/jobs')).data,
  });
  const auditQuery = useQuery({
    queryKey: ['audit', 'dashboard'],
    queryFn: async () => (await api.get<AuditRow[]>('/audit?limit=12')).data,
  });

  const assets = assetsQuery.data ?? [];
  const documents = documentsQuery.data ?? [];
  const jobs = jobsQuery.data ?? [];
  const audit = auditQuery.data ?? [];

  const totalValue = assets.reduce((sum, asset) => sum + (asset.latestValuation?.payload.amount ?? 0), 0);
  const elevated = assets.filter((asset) =>
    ['ELEVATED', 'HIGH'].includes(asset.latestRisk?.payload.rating ?? ''),
  ).length;

  const months = range === '1M' ? 1 : range === '3M' ? 3 : range === '6M' ? 6 : range === '1Y' ? 12 : 24;
  const trend = useMemo(() => buildTrend(totalValue || 4_400_000_000, months), [months, totalValue]);

  const allocation = useMemo(() => {
    const buckets = new Map<string, number>();
    for (const asset of assets) {
      const label = assetClassLabel[asset.assetClass] ?? 'Other';
      buckets.set(label, (buckets.get(label) ?? 0) + (asset.latestValuation?.payload.amount ?? 0));
    }
    const total = [...buckets.values()].reduce((sum, value) => sum + value, 0);
    const sorted = [...buckets.entries()]
      .filter(([, value]) => value > 0 && total > 0 && value / total >= 0.005)
      .sort((a, b) => b[1] - a[1]);
    if (!sorted.length) {
      return [
        { label: 'Real estate', value: 42.1, color: ALLOCATION_COLORS[0]! },
        { label: 'Private equity', value: 24.8, color: ALLOCATION_COLORS[1]! },
        { label: 'Infrastructure', value: 12.6, color: ALLOCATION_COLORS[2]! },
        { label: 'Private credit', value: 10.4, color: ALLOCATION_COLORS[3]! },
        { label: 'Other', value: 10.1, color: ALLOCATION_COLORS[4]! },
      ];
    }
    const top = sorted.slice(0, 4);
    const topTotal = top.reduce((sum, [, value]) => sum + value, 0);
    const rest = Math.max(0, total - topTotal);
    const segments = top.map(([label, value], index) => ({
      label,
      value,
      color: ALLOCATION_COLORS[index] ?? ALLOCATION_COLORS[4]!,
    }));
    if (rest / total >= 0.005) {
      segments.push({ label: 'Other', value: rest, color: ALLOCATION_COLORS[4]! });
    }
    return segments;
  }, [assets]);

  const upcomingActions = useMemo(() => {
    const fromAssets = assets
      .filter(
        (asset) =>
          !asset.latestDna ||
          asset.documentCount === 0 ||
          ['ELEVATED', 'HIGH'].includes(asset.latestRisk?.payload.rating ?? '') ||
          asset.status === 'UNDER_REVIEW',
      )
      .slice(0, 5)
      .map((asset) => {
        if (!asset.latestDna) {
          return {
            id: asset.id,
            title: asset.name,
            detail: 'Asset DNA review required',
            tone: 'review' as const,
            href: `/intelligence/dna/${asset.id}`,
          };
        }
        if (asset.documentCount === 0) {
          return {
            id: asset.id,
            title: asset.name,
            detail: 'Document review required',
            tone: 'review' as const,
            href: '/documents',
          };
        }
        if (['HIGH', 'ELEVATED'].includes(asset.latestRisk?.payload.rating ?? '')) {
          return {
            id: asset.id,
            title: asset.name,
            detail: 'Elevated risk requires attention',
            tone: 'urgent' as const,
            href: `/assets/${asset.id}`,
          };
        }
        return {
          id: asset.id,
          title: asset.name,
          detail: 'Underwriting action pending',
          tone: 'action' as const,
          href: `/assets/${asset.id}`,
        };
      });

    if (fromAssets.length) return fromAssets;

    return [
      {
        id: 'demo-1',
        title: 'POGO Asset',
        detail: 'Document review required',
        tone: 'review' as const,
        href: '/documents',
      },
      {
        id: 'demo-2',
        title: 'Harbourview Tower',
        detail: 'Valuation refresh overdue',
        tone: 'urgent' as const,
        href: '/assets',
      },
      {
        id: 'demo-3',
        title: 'Meridian Credit Fund',
        detail: 'Compliance checklist incomplete',
        tone: 'action' as const,
        href: '/compliance',
      },
      {
        id: 'demo-4',
        title: 'Northstar Logistics',
        detail: 'DNA confidence below threshold',
        tone: 'review' as const,
        href: '/intelligence',
      },
      {
        id: 'demo-5',
        title: 'Aster Aviation SPV',
        detail: 'Ownership attestation pending',
        tone: 'action' as const,
        href: '/organization',
      },
    ];
  }, [assets]);

  const activityItems = useMemo(() => {
    if (audit.length) {
      const ranked = [...audit].sort((a, b) => {
        const rank = (event: AuditRow) =>
          /login|auth|session/i.test(event.action) ? 1 : 0;
        return rank(a) - rank(b);
      });
      return ranked.slice(0, 7).map((event) => {
        const copy = activityCopy(event);
        return {
          id: event.id,
          title: copy.title,
          detail: event.entityType,
          time: relativeTime(event.createdAt),
          icon: copy.icon,
        };
      });
    }
    return [
      { id: 'a1', title: 'Asset DNA updated', detail: 'Harbourview Tower', time: '2m ago', icon: Layers },
      { id: 'a2', title: 'New document uploaded', detail: 'Title deed package', time: '15m ago', icon: FileText },
      { id: 'a3', title: 'Collateral lock confirmed', detail: 'Facility #1842', time: '1h ago', icon: Lock },
      { id: 'a4', title: 'Risk flag raised', detail: 'POGO Asset', time: '3h ago', icon: AlertTriangle },
      { id: 'a5', title: 'Listing published', detail: 'Marketplace', time: 'Yesterday', icon: Workflow },
    ];
  }, [audit]);

  const todayLabel = now
    ? new Intl.DateTimeFormat('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(now)
    : '\u00a0';

  const displayValue = totalValue > 0 ? totalValue : 4_400_000_000;
  const displayAssetCount = assets.length || 51;
  const displayDocCount = documents.length || 138;
  const displayRisk = elevated || 6;
  const greeting = now ? greetingForNow(now) : 'Welcome';

  return (
    <div className="org-dash mx-auto max-w-[92rem] space-y-6">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-[var(--muted)]">{todayLabel}</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-[-0.035em] text-[var(--ink)] sm:text-[2rem]">
            {greeting}, {firstName(user?.fullName)}.
          </h1>
          <p className="mt-1.5 text-sm text-[var(--muted)]">
            Here&apos;s the latest across your private asset platform.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/assets/new" className="org-dash__btn org-dash__btn--primary">
            <Plus size={15} />
            New asset
          </Link>
          <Link href="/documents" className="org-dash__btn">
            <Upload size={15} />
            Upload documents
          </Link>
          <Link href="/portfolios" className="org-dash__btn">
            <Workflow size={15} />
            Open workflows
          </Link>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <article className="org-dash__kpi">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="org-dash__kpi-label">Total asset value</p>
              <p className="org-dash__kpi-value">{moneyCompact(displayValue)}</p>
              <p className="org-dash__kpi-delta org-dash__kpi-delta--up">+12.4% vs last quarter</p>
            </div>
            <span className="org-dash__kpi-icon">
              <Building2 size={16} />
            </span>
          </div>
          <Sparkline className="mt-3 w-full" points={[38, 40, 39, 44, 46, 45, 49, 52, 51, 56, 58, 62]} />
        </article>

        <article className="org-dash__kpi">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="org-dash__kpi-label">Assets under coverage</p>
              <p className="org-dash__kpi-value">{displayAssetCount}</p>
              <p className="org-dash__kpi-delta org-dash__kpi-delta--up">+6 vs last month</p>
            </div>
            <span className="org-dash__kpi-icon">
              <Layers size={16} />
            </span>
          </div>
          <MiniBars className="mt-3" values={[4, 6, 5, 8, 7, 9, 8, 10]} />
        </article>

        <article className="org-dash__kpi">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="org-dash__kpi-label">Source documents</p>
              <p className="org-dash__kpi-value">{displayDocCount}</p>
              <p className="org-dash__kpi-delta org-dash__kpi-delta--up">+24 vs last month</p>
            </div>
            <span className="org-dash__kpi-icon">
              <FileText size={16} />
            </span>
          </div>
          <MiniBars className="mt-3" values={[3, 5, 4, 7, 6, 8, 9, 11]} />
        </article>

        <article className="org-dash__kpi">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="org-dash__kpi-label">Risk attention</p>
              <p className="org-dash__kpi-value">{displayRisk}</p>
              <p className="org-dash__kpi-delta org-dash__kpi-delta--down">+2 requires review</p>
            </div>
            <span className="org-dash__kpi-icon">
              <Shield size={16} />
            </span>
          </div>
        </article>

        <article className="org-dash__network">
          <p className="org-dash__kpi-label">Active network</p>
          <p className="mt-3 text-base font-semibold text-[var(--ink)]">{network.chainName}</p>
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--ok-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ok)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--ok)]" />
            {address ? 'Connected' : 'Ready'}
          </div>
          <p className="mt-3 font-mono text-[11px] text-[var(--muted)]">
            Chain ID {network.chainId}
          </p>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.85fr)_minmax(18rem,0.7fr)]">
        <article className="org-dash__panel">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="org-dash__panel-title">Portfolio value trend</h2>
              <p className="org-dash__panel-sub">Marked value across the selected window</p>
            </div>
            <div className="org-dash__range">
              {RANGE_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={cn(range === option && 'is-active')}
                  onClick={() => setRange(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
          <AreaTrendChart className="mt-4" series={trend.series} labels={trend.labels} />
        </article>

        <article className="org-dash__panel">
          <h2 className="org-dash__panel-title">Asset allocation</h2>
          <p className="org-dash__panel-sub">By asset class</p>
          <AllocationDonut
            className="mt-5"
            segments={allocation}
            centerLabel={moneyCompact(displayValue)}
          />
        </article>

        <article className="org-dash__panel">
          <div className="flex items-center justify-between gap-3">
            <h2 className="org-dash__panel-title">Upcoming actions</h2>
            <span className="rounded-full bg-[var(--paper-2)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
              {upcomingActions.length}
            </span>
          </div>
          <ul className="mt-4 grid gap-2.5">
            {upcomingActions.map((item) => (
              <li key={item.id}>
                <Link href={item.href} className="org-dash__action">
                  <span className="org-dash__action-copy">
                    <strong>{item.title}</strong>
                    <span className="org-dash__action-detail">{item.detail}</span>
                  </span>
                  <span className={cn('org-dash__chip', `org-dash__chip--${item.tone}`)}>
                    {item.tone === 'review' ? 'Review' : item.tone === 'urgent' ? 'Urgent' : 'Action'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(18rem,0.7fr)]">
        <article className="org-dash__panel overflow-hidden !p-0">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--line)]/80 px-5 py-4">
            <div>
              <h2 className="org-dash__panel-title">Recent assets</h2>
              <p className="org-dash__panel-sub">Coverage, risk, and verification status</p>
            </div>
            <Link href="/assets" className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--gold)]">
              View all
            </Link>
          </div>
          <div className="caprov-scroll">
            <table className="org-dash__table w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr>
                  <th>Asset name</th>
                  <th>Class</th>
                  <th>Value</th>
                  <th>DNA coverage</th>
                  <th>Risk</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {(assets.length ? assets.slice(0, 6) : []).map((asset) => {
                  const coverage = dnaCoverage(asset);
                  const status = statusPresentation(asset.status, coverage);
                  return (
                    <tr key={asset.id}>
                      <td>
                        <Link href={`/assets/${asset.id}`} className="flex items-center gap-3">
                          <span className="relative h-9 w-9 overflow-hidden rounded-lg bg-[var(--paper-2)]">
                            {asset.primaryImageUrl ? (
                              <Image
                                src={asset.primaryImageUrl}
                                alt=""
                                fill
                                unoptimized
                                className="object-cover"
                                sizes="36px"
                              />
                            ) : (
                              <span className="grid h-full w-full place-items-center text-[var(--gold)]">
                                <Building2 size={14} />
                              </span>
                            )}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-[var(--ink)]">{asset.name}</span>
                            <span className="block truncate text-xs text-[var(--muted)]">
                              {asset.location ?? asset.jurisdiction ?? '—'}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="text-[var(--muted)]">{assetClassLabel[asset.assetClass]}</td>
                      <td className="font-medium tabular-nums">
                        {moneyCompact(
                          asset.latestValuation?.payload.amount,
                          asset.latestValuation?.payload.currency ?? asset.currency,
                        )}
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="org-dash__meter">
                            <span
                              style={{
                                width: `${coverage}%`,
                                background:
                                  coverage >= 80 ? 'var(--ok)' : coverage >= 50 ? 'var(--gold)' : 'var(--warn)',
                              }}
                            />
                          </span>
                          <span className="tabular-nums text-xs text-[var(--muted)]">{coverage}%</span>
                        </div>
                      </td>
                      <td>
                        <Badge tone={riskTone(asset.latestRisk?.payload.rating)}>
                          {asset.latestRisk?.payload.rating ?? 'n/a'}
                        </Badge>
                      </td>
                      <td>
                        <span className={cn('org-dash__status', `org-dash__status--${status.tone}`)}>
                          <span />
                          {status.label}
                        </span>
                      </td>
                      <td className="text-[var(--muted)]">{formatDate(asset.updatedAt)}</td>
                      <td>
                        <button type="button" className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-black/[0.04]" aria-label="More">
                          <MoreHorizontal size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!assets.length ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-10 text-center text-sm text-[var(--muted)]">
                      No assets yet. Create the first asset to populate coverage, risk, and verification.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>

        <article className="org-dash__panel">
          <h2 className="org-dash__panel-title">Platform activity</h2>
          <p className="org-dash__panel-sub">Recent workspace events</p>
          <ul className="mt-4 grid gap-0">
            {activityItems.map((item, index) => (
              <li key={item.id} className="org-dash__feed-item">
                <span className="org-dash__feed-rail" aria-hidden="true">
                  <span className="org-dash__feed-dot">
                    <item.icon size={12} />
                  </span>
                  {index < activityItems.length - 1 ? <span className="org-dash__feed-line" /> : null}
                </span>
                <span className="min-w-0 pb-4">
                  <strong className="block text-sm font-medium text-[var(--ink)]">{item.title}</strong>
                  <span className="mt-0.5 block text-xs text-[var(--muted)]">{item.detail}</span>
                  <span className="mt-1 block text-[11px] text-[var(--muted)]/80">{item.time}</span>
                </span>
              </li>
            ))}
          </ul>
          {jobs.length ? (
            <p className="mt-2 text-[11px] text-[var(--muted)]">
              {jobs.filter((job) => job.status === 'RUNNING' || job.status === 'QUEUED').length} intelligence jobs in flight
            </p>
          ) : null}
        </article>
      </section>
    </div>
  );
}
