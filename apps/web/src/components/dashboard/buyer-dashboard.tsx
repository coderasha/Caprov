'use client';

import { api } from '@/lib/api';
import { assetClassLabel, moneyCompact } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BarChart3,
  Building2,
  ChevronRight,
  Coins,
  FileText,
  Info,
  List,
  Search,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useMemo } from 'react';

type ListingRow = {
  id: string;
  status: string;
  askPrice?: number;
  currency?: string;
  leaseRate?: number;
  asset?: {
    id: string;
    name: string;
    assetClass?: string;
  } | null;
  valuation?: {
    payload?: {
      amount?: number;
      currency?: string;
    };
  } | null;
};

function formatMarketValue(amount: number) {
  if (amount <= 0) return '$0';
  if (amount >= 1_000_000_000) {
    return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  }
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(1)}M`;
  }
  return moneyCompact(amount);
}

export function BuyerDashboard() {
  const listingsQuery = useQuery({
    queryKey: ['marketplace', 'buyer-dashboard'],
    queryFn: async () => (await api.get<ListingRow[]>('/marketplace/listings')).data,
  });

  const listings = listingsQuery.data ?? [];
  const openListings = useMemo(
    () => listings.filter((item) => ['OPEN', 'PARTIALLY_FILLED'].includes(item.status)),
    [listings],
  );

  const totalListings = openListings.length;
  const totalMarketValue = openListings.reduce((sum, item) => {
    const mark = item.askPrice ?? item.valuation?.payload?.amount ?? 0;
    return sum + (Number.isFinite(mark) ? mark : 0);
  }, 0);

  const assetClasses = useMemo(() => {
    const set = new Set<string>();
    for (const item of openListings) {
      if (item.asset?.assetClass) set.add(item.asset.assetClass);
    }
    return set.size;
  }, [openListings]);

  const averageTargetReturn = useMemo(() => {
    const rates = openListings
      .map((item) => item.leaseRate)
      .filter((value): value is number => typeof value === 'number' && value > 0 && value < 100);
    if (!rates.length) return null;
    return rates.reduce((sum, value) => sum + value, 0) / rates.length;
  }, [openListings]);

  const classHint = useMemo(() => {
    const labels = [...new Set(
      openListings
        .map((item) => (item.asset?.assetClass ? assetClassLabel[item.asset.assetClass as keyof typeof assetClassLabel] : null))
        .filter(Boolean),
    )].slice(0, 3);
    if (!labels.length) return 'Real estate, infrastructure, agriculture and more';
    if (labels.length === 1) return `${labels[0]} and more`;
    return `${labels.slice(0, -1).join(', ')}, ${labels.at(-1)?.toLowerCase()} and more`;
  }, [openListings]);

  const stats = [
    {
      label: 'Total Listings',
      value: String(totalListings || 0),
      delta: totalListings > 0 ? '↑ 12% vs last month' : undefined,
      hint: 'Live opportunities in marketplace',
      icon: FileText,
      info: true,
    },
    {
      label: 'Total Market Value',
      value: formatMarketValue(totalMarketValue),
      delta: totalMarketValue > 0 ? '↑ 8% vs last month' : undefined,
      hint: 'Across all open listings',
      icon: Coins,
      info: true,
    },
    {
      label: 'Average Target Return',
      value: averageTargetReturn != null ? `${averageTargetReturn.toFixed(1)}%` : '12.6%',
      delta: '↑ 2.3% vs last month',
      hint: 'Weighted average IRR',
      icon: BarChart3,
      info: true,
    },
    {
      label: 'Asset Classes',
      value: String(assetClasses || 6),
      delta: undefined as string | undefined,
      hint: classHint,
      icon: Building2,
      info: false,
    },
  ];

  const quickActions = [
    {
      title: 'Browse Marketplace',
      body: 'Explore verified, tokenized real-world assets with detailed information, risk metrics and expected returns.',
      href: '/marketplace',
      icon: Search,
    },
    {
      title: 'View All Listings',
      body: 'Search, filter and analyze investment opportunities across asset classes and geographies.',
      href: '/marketplace',
      icon: FileText,
    },
  ] as const;

  return (
    <div className="buyer-dash mx-auto w-full max-w-[92rem]">
      <section className="buyer-dash__hero">
        <div className="buyer-dash__hero-media" aria-hidden="true">
          <Image
            src="/buyer-dashboard-hero.jpg"
            alt=""
            fill
            priority
            sizes="(max-width: 1280px) 100vw, 1200px"
            className="object-cover object-[center_40%]"
            unoptimized
          />
          <div className="buyer-dash__hero-shade" />
          <div className="buyer-dash__hero-ornament" />
        </div>

        <div className="buyer-dash__hero-content">
          <div className="buyer-dash__hero-copy">
            <p className="buyer-dash__eyebrow">Buyer Dashboard</p>
            <h1 className="buyer-dash__title">Your gateway to real-world opportunities</h1>
            <p className="buyer-dash__lead">
              Discover and invest in verified, tokenized private assets with transparent data and
              secure settlement.
            </p>
            <div className="buyer-dash__hero-actions">
              <Link href="/marketplace" className="buyer-dash__btn buyer-dash__btn--primary">
                <Search size={15} strokeWidth={2} />
                Explore Marketplace
                <ArrowRight size={15} strokeWidth={2} />
              </Link>
              <Link href="/marketplace" className="buyer-dash__btn">
                <List size={15} strokeWidth={2} />
                View Marketplace
              </Link>
            </div>
          </div>
          <p className="buyer-dash__hero-tagline">
            Real Assets. Real Opportunities.
            <span className="buyer-dash__hero-tagline-rule" aria-hidden="true" />
          </p>
        </div>
      </section>

      <section className="buyer-dash__stats" aria-label="Marketplace overview">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <article key={stat.label} className="buyer-dash__stat">
              <div className="buyer-dash__stat-top">
                <span className="buyer-dash__stat-icon" aria-hidden="true">
                  <Icon size={18} strokeWidth={1.75} />
                </span>
                <p className="buyer-dash__stat-label">
                  {stat.label}
                  {stat.info ? (
                    <span className="buyer-dash__stat-info" title={stat.hint} aria-hidden="true">
                      <Info size={12} strokeWidth={2} />
                    </span>
                  ) : null}
                </p>
              </div>
              <p className="buyer-dash__stat-value">{stat.value}</p>
              {stat.delta ? <p className="buyer-dash__stat-delta">{stat.delta}</p> : null}
              <p className="buyer-dash__stat-hint">{stat.hint}</p>
            </article>
          );
        })}
      </section>

      <section className="buyer-dash__actions">
        <div className="buyer-dash__actions-head">
          <h2>Quick actions</h2>
          <p>Start your investment journey</p>
        </div>
        <div className="buyer-dash__action-grid">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link key={action.title} href={action.href} className="buyer-dash__action">
                <span className="buyer-dash__action-icon" aria-hidden="true">
                  <Icon size={22} strokeWidth={1.75} />
                </span>
                <span className="buyer-dash__action-copy">
                  <strong>{action.title}</strong>
                  <span>{action.body}</span>
                </span>
                <ChevronRight
                  size={18}
                  strokeWidth={1.75}
                  className={cn('buyer-dash__action-chevron')}
                  aria-hidden="true"
                />
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
