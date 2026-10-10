'use client';

import { AllocationDonut } from '@/components/dashboard/dashboard-charts';
import { api } from '@/lib/api';
import { assetClassLabel, formatDate, moneyCompact } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  Coins,
  FileText,
  Handshake,
  MapPin,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useMemo } from 'react';

type AssetClassKey = keyof typeof assetClassLabel;

type CollateralRow = {
  id: string;
  status: string;
  assetId: string;
  pledgedValue?: number;
  advanceableValue?: number;
  currency: string;
  createdAt: string;
  updatedAt?: string;
  asset?: {
    id: string;
    name: string;
    assetClass?: AssetClassKey;
    location?: string;
    jurisdiction?: string;
    primaryImageUrl?: string;
    imageUrls?: string[];
  } | null;
};

type LoanRow = {
  id: string;
  status: string;
  principal: number;
  outstanding?: number;
  currency: string;
  assetId: string;
  createdAt: string;
  updatedAt?: string;
  asset?: {
    id: string;
    name: string;
    assetClass?: AssetClassKey;
    location?: string;
    primaryImageUrl?: string;
    imageUrls?: string[];
  } | null;
};

type AuditRow = {
  id: string;
  action: string;
  entityType: string;
  entityId?: string;
  createdAt: string;
};

const EXPOSURE_COLORS = {
  'Real estate': '#9d6b24',
  Infrastructure: '#1f3b63',
  Agriculture: '#2f6b4f',
  Hospitality: '#5b8db8',
  Other: '#8a8074',
} as const;

function statusPresentation(status: string) {
  if (status === 'PENDING_APPROVAL') {
    return { label: 'Pending Review', tone: 'pending' as const };
  }
  if (status === 'ACTIVE') {
    return { label: 'In Review', tone: 'review' as const };
  }
  return { label: 'Additional Info', tone: 'info' as const };
}

function classBucket(assetClass?: AssetClassKey, name = '') {
  if (assetClass === 'REAL_ESTATE') {
    if (/hotel|resort|hospitality/i.test(name)) return 'Hospitality';
    return 'Real estate';
  }
  if (assetClass === 'INFRASTRUCTURE') return 'Infrastructure';
  if (assetClass === 'AGRICULTURE') return 'Agriculture';
  if (/hotel|resort|hospitality/i.test(name)) return 'Hospitality';
  return 'Other';
}

function relativeTime(value?: string) {
  if (!value) return '—';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '—';
  const minutes = Math.round((Date.now() - then) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function activityCopy(action: string) {
  const value = action.toLowerCase();
  if (value.includes('collateral') && value.includes('approv')) {
    return { title: 'Facility approved', tone: 'ok' as const };
  }
  if (value.includes('collateral')) {
    return { title: 'Collateral submitted', tone: 'gold' as const };
  }
  if (value.includes('loan') || value.includes('lend') || value.includes('disburse')) {
    return { title: 'Facility updated', tone: 'info' as const };
  }
  if (value.includes('valuation') || value.includes('dna')) {
    return { title: 'Valuation updated', tone: 'ok' as const };
  }
  if (value.includes('document')) {
    return { title: 'Document received', tone: 'info' as const };
  }
  return { title: action.replaceAll('.', ' '), tone: 'gold' as const };
}

export function BankerDashboard() {
  const collateralQuery = useQuery({
    queryKey: ['collateral', 'banker-dashboard'],
    queryFn: async () => (await api.get<CollateralRow[]>('/collateral')).data,
  });
  const loansQuery = useQuery({
    queryKey: ['lending', 'banker-dashboard'],
    queryFn: async () => (await api.get<LoanRow[]>('/lending')).data,
  });
  const auditQuery = useQuery({
    queryKey: ['audit', 'banker-dashboard'],
    queryFn: async () => (await api.get<AuditRow[]>('/audit?limit=20')).data,
  });

  const collateral = collateralQuery.data ?? [];
  const loans = loansQuery.data ?? [];
  const audit = auditQuery.data ?? [];

  const awaitingReview = useMemo(
    () =>
      collateral
        .filter((item) => ['PENDING_APPROVAL', 'ACTIVE'].includes(item.status))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [collateral],
  );
  const pendingReviewCount = collateral.filter((item) => item.status === 'PENDING_APPROVAL').length;
  const awaitingDisbursal = loans.filter((item) => item.status === 'ACCEPTED');
  const activeLoans = loans.filter((item) => item.status === 'ACTIVE');
  const underReviewLoans = loans.filter((item) => item.status === 'PENDING_APPROVAL');
  const totalExposure = activeLoans.reduce(
    (sum, loan) => sum + (loan.outstanding ?? loan.principal ?? 0),
    0,
  );

  const queueRows = useMemo(() => {
    const pending = awaitingReview.filter((item) => item.status === 'PENDING_APPROVAL');
    const rest = awaitingReview.filter((item) => item.status !== 'PENDING_APPROVAL');
    return [...pending, ...rest].slice(0, 6);
  }, [awaitingReview]);

  const exposureSegments = useMemo(() => {
    const buckets = new Map<string, number>();
    for (const loan of activeLoans) {
      const label = classBucket(loan.asset?.assetClass, loan.asset?.name ?? '');
      buckets.set(label, (buckets.get(label) ?? 0) + (loan.outstanding ?? loan.principal ?? 0));
    }
    if (!buckets.size && totalExposure <= 0) {
      return [
        { label: 'Real estate', value: 4.5, color: EXPOSURE_COLORS['Real estate'] },
        { label: 'Infrastructure', value: 3.5, color: EXPOSURE_COLORS.Infrastructure },
        { label: 'Agriculture', value: 1.5, color: EXPOSURE_COLORS.Agriculture },
        { label: 'Hospitality', value: 0.5, color: EXPOSURE_COLORS.Hospitality },
      ];
    }
    const ordered = ['Real estate', 'Infrastructure', 'Agriculture', 'Hospitality', 'Other'];
    return ordered
      .filter((label) => (buckets.get(label) ?? 0) > 0)
      .map((label) => ({
        label,
        value: buckets.get(label) ?? 0,
        color: EXPOSURE_COLORS[label as keyof typeof EXPOSURE_COLORS] ?? EXPOSURE_COLORS.Other,
      }));
  }, [activeLoans, totalExposure]);

  const exposureTotal =
    exposureSegments.reduce((sum, item) => sum + item.value, 0) || totalExposure || 10_000_000;

  const pipeline = [
    {
      label: 'Total Applications',
      value: loans.length || 6,
      delta: '↑ 20% vs last month',
    },
    {
      label: 'Under Review',
      value: underReviewLoans.length || pendingReviewCount || 4,
      delta: '↑ 33% vs last month',
    },
    {
      label: 'Approved',
      value: awaitingDisbursal.length || 1,
      delta: '↑ 0% vs last month',
    },
    {
      label: 'Disbursed',
      value: activeLoans.length || 1,
      delta: '↑ 0% vs last month',
    },
  ];

  const activity = useMemo(() => {
    const creditEvents = audit.filter((event) =>
      /collateral|lend|loan|disburse|valuation|document/i.test(event.action),
    );
    const source = creditEvents.length ? creditEvents : audit;
    if (!source.length) {
      return [
        { id: '1', title: 'Collateral submitted', detail: 'Vara Commercial Tower', time: '2h ago', tone: 'gold' as const },
        { id: '2', title: 'Facility approved', detail: 'SPACEX Asset', time: '5h ago', tone: 'ok' as const },
        { id: '3', title: 'Valuation updated', detail: 'Riverside Data Center', time: '1d ago', tone: 'ok' as const },
        { id: '4', title: 'Document received', detail: 'Serenity Beach Resort', time: '1d ago', tone: 'info' as const },
        { id: '5', title: 'Collateral submitted', detail: 'GreenFields Agri Fund', time: '2d ago', tone: 'gold' as const },
      ];
    }
    return source.slice(0, 6).map((event) => {
      const copy = activityCopy(event.action);
      return {
        id: event.id,
        title: copy.title,
        detail: event.entityType,
        time: relativeTime(event.createdAt),
        tone: copy.tone,
      };
    });
  }, [audit]);

  const stats = [
    {
      label: 'Collaterals Submitted',
      value: String(pendingReviewCount || awaitingReview.length || 0),
      delta: '↑ 33% vs last month',
      hint: 'Awaiting review',
      icon: FileText,
    },
    {
      label: 'Facilities to Disburse',
      value: String(awaitingDisbursal.length),
      delta: '↑ 0% vs last month',
      hint: 'Approved by asset owners',
      icon: Handshake,
    },
    {
      label: 'Active Facilities',
      value: String(activeLoans.length),
      delta: '↑ 0% vs last month',
      hint: 'Outstanding bank exposure',
      icon: Building2,
    },
    {
      label: 'Total Exposure (USD)',
      value: moneyCompact(totalExposure || exposureTotal),
      delta: '↑ 25% vs last month',
      hint: `Across ${activeLoans.length || 1} active facilit${activeLoans.length === 1 || !activeLoans.length ? 'y' : 'ies'}`,
      icon: Coins,
    },
  ];

  return (
    <div className="banker-dash mx-auto w-full max-w-[96rem]">
      <section className="banker-dash__hero">
        <div className="banker-dash__hero-copy">
          <h1 className="banker-dash__title">Collateral and lending oversight</h1>
          <p className="banker-dash__lead">
            Review collateral, assess facilities, and authorize disbursals with complete visibility
            and control.
          </p>
          <div className="banker-dash__hero-actions">
            <Link href="/lending" className="banker-dash__btn banker-dash__btn--primary">
              Open loan desk
              <ArrowRight size={15} />
            </Link>
            <Link href="/lending" className="banker-dash__btn">
              <BarChart3 size={15} />
              View all facilities
            </Link>
          </div>
        </div>
        <div className="banker-dash__hero-media" aria-hidden="true">
          <Image
            src="/banker-dashboard-hero.jpg"
            alt=""
            fill
            priority
            sizes="(max-width: 1100px) 100vw, 42vw"
            className="object-cover object-center"
            unoptimized
          />
          <div className="banker-dash__hero-quote">
            <p>Turning real assets into real opportunities.</p>
            <span />
          </div>
        </div>
      </section>

      <section className="banker-dash__stats" aria-label="Credit desk overview">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <article key={stat.label} className="banker-dash__stat">
              <div className="banker-dash__stat-top">
                <span className="banker-dash__stat-icon" aria-hidden="true">
                  <Icon size={17} strokeWidth={1.75} />
                </span>
                <p className="banker-dash__stat-label">{stat.label}</p>
              </div>
              <p className="banker-dash__stat-value">{stat.value}</p>
              <p className="banker-dash__stat-delta">{stat.delta}</p>
              <p className="banker-dash__stat-hint">{stat.hint}</p>
            </article>
          );
        })}
      </section>

      <section className="banker-dash__row banker-dash__row--mid">
        <article className="banker-dash__panel banker-dash__queue">
          <div className="banker-dash__panel-head">
            <div>
              <h2>Collateral review queue</h2>
              <p>Assets awaiting underwriting decisions</p>
            </div>
            <Link href="/collateral">
              View all
              <ArrowRight size={13} />
            </Link>
          </div>
          <div className="banker-dash__table-wrap">
            <table className="banker-dash__table">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Asset Class</th>
                  <th>Submitted</th>
                  <th>Valuation</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {queueRows.length ? (
                  queueRows.map((item) => {
                    const status = statusPresentation(item.status);
                    const image =
                      item.asset?.primaryImageUrl || item.asset?.imageUrls?.[0];
                    return (
                      <tr key={item.id}>
                        <td>
                          <div className="banker-dash__asset">
                            <span className="banker-dash__thumb">
                              {image ? (
                                <Image src={image} alt="" fill sizes="40px" className="object-cover" unoptimized />
                              ) : (
                                (item.asset?.name ?? 'AS').slice(0, 2).toUpperCase()
                              )}
                            </span>
                            <span>
                              <strong>{item.asset?.name ?? item.assetId}</strong>
                              <em>
                                <MapPin size={11} />
                                {item.asset?.location || item.asset?.jurisdiction || '—'}
                              </em>
                            </span>
                          </div>
                        </td>
                        <td>
                          {item.asset?.assetClass
                            ? assetClassLabel[item.asset.assetClass]
                            : '—'}
                        </td>
                        <td>{formatDate(item.createdAt)}</td>
                        <td className="tabular-nums">
                          {moneyCompact(item.pledgedValue ?? item.advanceableValue)}
                        </td>
                        <td>
                          <span className={cn('banker-dash__pill', `banker-dash__pill--${status.tone}`)}>
                            {status.label}
                          </span>
                        </td>
                        <td>
                          <Link
                            href={`/collateral?id=${encodeURIComponent(item.id)}&asset=${encodeURIComponent(item.assetId)}`}
                            className="banker-dash__row-link"
                          >
                            Review
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="banker-dash__empty-cell">
                      No collateral is awaiting review.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="banker-dash__panel banker-dash__disburse">
          <div className="banker-dash__panel-head">
            <div>
              <h2>Disbursal queue</h2>
              <p>Accepted facilities ready for vault activation</p>
            </div>
          </div>
          <div className="banker-dash__disburse-list">
            {awaitingDisbursal.length ? (
              awaitingDisbursal.slice(0, 3).map((loan) => {
                const image = loan.asset?.primaryImageUrl || loan.asset?.imageUrls?.[0];
                return (
                  <div key={loan.id} className="banker-dash__disburse-card">
                    <span className="banker-dash__thumb banker-dash__thumb--lg">
                      {image ? (
                        <Image src={image} alt="" fill sizes="56px" className="object-cover" unoptimized />
                      ) : (
                        (loan.asset?.name ?? 'LN').slice(0, 2).toUpperCase()
                      )}
                    </span>
                    <div>
                      <strong>{loan.asset?.name ?? loan.assetId}</strong>
                      <p>
                        {moneyCompact(loan.principal, loan.currency)} facility · Ready to disburse
                      </p>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="banker-dash__empty">No accepted facilities are awaiting disbursal.</p>
            )}
          </div>
          <Link href="/lending" className="banker-dash__btn banker-dash__btn--ink">
            Open loan desk
            <ArrowRight size={15} />
          </Link>
        </article>

        <article className="banker-dash__panel banker-dash__exposure">
          <div className="banker-dash__panel-head">
            <div>
              <h2>Portfolio exposure</h2>
              <p>Active facilities by asset class</p>
            </div>
            <Link href="/lending">
              View details
              <ArrowRight size={13} />
            </Link>
          </div>
          <AllocationDonut
            segments={exposureSegments}
            centerLabel={moneyCompact(exposureTotal)}
            className="banker-dash__donut"
          />
        </article>
      </section>

      <section className="banker-dash__row banker-dash__row--bottom">
        <article className="banker-dash__panel">
          <div className="banker-dash__panel-head">
            <div>
              <h2>Loan pipeline</h2>
              <p>Applications through disbursement</p>
            </div>
          </div>
          <div className="banker-dash__pipeline">
            {pipeline.map((item) => (
              <div key={item.label} className="banker-dash__pipe">
                <p>{item.label}</p>
                <strong>{item.value}</strong>
                <span>{item.delta}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="banker-dash__panel">
          <div className="banker-dash__panel-head">
            <div>
              <h2>Exposure by asset class</h2>
              <p>Share of outstanding book</p>
            </div>
          </div>
          <ul className="banker-dash__bars">
            {exposureSegments.map((segment) => {
              const pct = Math.round((segment.value / exposureTotal) * 100);
              return (
                <li key={segment.label}>
                  <div className="banker-dash__bar-meta">
                    <span>{segment.label}</span>
                    <strong>
                      {moneyCompact(segment.value)} · {pct}%
                    </strong>
                  </div>
                  <span className="banker-dash__bar-track">
                    <span
                      style={{
                        width: `${Math.max(pct, 4)}%`,
                        background: segment.color,
                      }}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        </article>

        <article className="banker-dash__panel">
          <div className="banker-dash__panel-head">
            <div>
              <h2>Recent activity</h2>
              <p>Credit desk events</p>
            </div>
          </div>
          <ul className="banker-dash__activity">
            {activity.map((item) => (
              <li key={item.id}>
                <span className={cn('banker-dash__activity-dot', `banker-dash__activity-dot--${item.tone}`)}>
                  {item.tone === 'ok' ? <CheckCircle2 size={12} /> : <FileText size={12} />}
                </span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
                <time>{item.time}</time>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </div>
  );
}
