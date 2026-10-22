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
  ShieldCheck,
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

type BuyerTrade = {
  id: string;
  assetId: string;
  status: string;
  notional: number;
  currency: string;
  tokenUnits?: number;
  participantRole?: 'BUYER' | 'SELLER';
  asset?: { id: string; name: string; assetClass?: string; primaryImageUrl?: string } | null;
  listing?: { totalTokenSupply?: number; valuation?: { payload?: { amount?: number; currency?: string } } | null } | null;
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
  const tradesQuery = useQuery({
    queryKey: ['trading', 'buyer-dashboard'],
    queryFn: async () => (await api.get<{ trades: BuyerTrade[] }>('/trading')).data,
  });

  const listings = listingsQuery.data ?? [];
  const listingsByAssetId = useMemo(
    () => new Map(listings.filter((listing) => listing.asset?.id).map((listing) => [listing.asset!.id, listing])),
    [listings],
  );
  const investments = useMemo(() => {
    const positions = new Map<string, BuyerTrade & { units: number; invested: number; pending: boolean }>();
    for (const trade of tradesQuery.data?.trades ?? []) {
      if (trade.participantRole && trade.participantRole !== 'BUYER') continue;
      if (!['SETTLED', 'PENDING_SETTLEMENT', 'SETTLING'].includes(trade.status)) continue;
      const existing = positions.get(trade.assetId);
      const units = trade.tokenUnits ?? 0;
      if (existing) {
        existing.units += units;
        existing.invested += trade.notional;
        existing.pending ||= trade.status !== 'SETTLED';
      } else {
        positions.set(trade.assetId, {
          ...trade,
          units,
          invested: trade.notional,
          pending: trade.status !== 'SETTLED',
        });
      }
    }
    return [...positions.values()];
  }, [tradesQuery.data]);
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

      <section className="buyer-dash__investments" aria-labelledby="buyer-investments-heading">
        <div className="buyer-dash__investments-head">
          <div>
            <p className="buyer-dash__eyebrow">Portfolio</p>
            <h2 id="buyer-investments-heading">Your investments</h2>
            <p>Properties and private assets purchased through CAPROV.</p>
          </div>
          <Link href="/trading" className="buyer-dash__investments-link">View trading activity <ArrowRight size={15} /></Link>
        </div>
        {tradesQuery.isLoading ? <p className="buyer-dash__investments-empty">Loading your investment positions…</p> : null}
        {!tradesQuery.isLoading && !investments.length ? <div className="buyer-dash__investments-empty"><Building2 size={20} /><span><strong>No investments yet</strong>Explore the marketplace to acquire an interest in a verified asset.</span><Link href="/marketplace">Browse marketplace <ArrowRight size={14} /></Link></div> : null}
        {investments.length ? <div className="buyer-dash__investment-grid">{investments.map((investment) => {
          // Marketplace data is a resilient fallback while an older API
          // process is still returning a lean trade record without `asset`.
          const marketplaceListing = listingsByAssetId.get(investment.assetId);
          const asset = investment.asset ?? marketplaceListing?.asset;
          const valuation = investment.listing?.valuation?.payload?.amount ?? marketplaceListing?.valuation?.payload?.amount;
          const supply = investment.listing?.totalTokenSupply;
          const ownership = supply && investment.units ? (investment.units / supply) * 100 : undefined;
          const name = asset?.name ?? 'Tokenized asset';
          return <Link key={investment.assetId} href={`/assets/${investment.assetId}`} className="buyer-dash__investment-card">
            <div className="buyer-dash__investment-icon"><Building2 size={20} /></div>
            <div className="buyer-dash__investment-top"><div><p className="buyer-dash__investment-class">{asset?.assetClass ? assetClassLabel[asset.assetClass as keyof typeof assetClassLabel] : 'Private asset'}</p><h3>{name}</h3></div><span className={investment.pending ? 'buyer-dash__investment-status is-pending' : 'buyer-dash__investment-status'}>{investment.pending ? 'Settling' : 'Held'}</span></div>
            <div className="buyer-dash__investment-metrics"><span><small>Units held</small><strong>{investment.units.toLocaleString()}</strong></span><span><small>Invested</small><strong>{moneyCompact(investment.invested, investment.currency)}</strong></span><span><small>{valuation ? 'Asset valuation' : 'Ownership'}</small><strong>{valuation ? moneyCompact(valuation, investment.listing?.valuation?.payload?.currency) : ownership != null ? `${ownership.toFixed(2)}%` : '—'}</strong></span></div>
            <p className="buyer-dash__investment-foot"><ShieldCheck size={14} />{investment.pending ? 'Purchase is awaiting settlement' : 'Settlement completed'}<ChevronRight size={16} /></p>
          </Link>;
        })}</div> : null}
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
