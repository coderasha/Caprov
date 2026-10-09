'use client';

import { api } from '@/lib/api';
import { assetClassLabel, moneyCompact } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  Building2,
  ChevronDown,
  Heart,
  LayoutGrid,
  Leaf,
  List,
  Lock,
  MapPin,
  PieChart,
  Search,
  ShieldCheck,
  Trees,
  Warehouse,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';

type AssetClassKey = keyof typeof assetClassLabel;

interface Listing {
  id: string;
  assetId: string;
  title: string;
  status: string;
  offeringType?: 'SALE' | 'LEASE';
  summary?: string;
  imageUrl?: string;
  askPrice: number;
  currency: string;
  leaseRate?: number;
  createdAt?: string;
  closedAt?: string;
  tokenizationMode?: 'LIVE' | 'SIMULATED';
  onChainListingId?: string;
  availableTokenUnits?: number;
  totalTokenSupply?: number;
  pricePerTokenWei?: string;
  token?: {
    tokenId: string;
    supply: number;
  } | null;
  asset?: {
    name: string;
    assetClass?: AssetClassKey;
    location?: string;
    jurisdiction?: string;
    primaryImageUrl?: string;
    imageUrls?: string[];
  } | null;
  valuation?: {
    payload?: {
      amount?: number;
      currency?: string;
    };
  } | null;
}

type CategoryId =
  | 'ALL'
  | 'REAL_ESTATE'
  | 'INFRASTRUCTURE'
  | 'AGRICULTURE'
  | 'PRIVATE_CREDIT'
  | 'HOSPITALITY';

type SortId = 'newest' | 'value_desc' | 'value_asc' | 'irr_desc';
type ViewMode = 'grid' | 'list';

const CATEGORIES: Array<{
  id: CategoryId;
  label: string;
  icon: typeof Building2;
}> = [
  { id: 'ALL', label: 'All Assets', icon: LayoutGrid },
  { id: 'REAL_ESTATE', label: 'Real Estate', icon: Building2 },
  { id: 'INFRASTRUCTURE', label: 'Infrastructure', icon: Warehouse },
  { id: 'AGRICULTURE', label: 'Agriculture', icon: Leaf },
  { id: 'PRIVATE_CREDIT', label: 'Private Credit', icon: PieChart },
  { id: 'HOSPITALITY', label: 'Hospitality', icon: Trees },
];

const RETURN_BANDS = [
  { id: 'lt5', label: '< 5%', min: 0, max: 5 },
  { id: '5to10', label: '5% – 10%', min: 5, max: 10 },
  { id: '10to15', label: '10% – 15%', min: 10, max: 15 },
  { id: 'gt15', label: '> 15%', min: 15, max: 100 },
] as const;

const TOKEN_STATUS = [
  { id: 'verified', label: 'Verified' },
  { id: 'tokenized', label: 'Tokenized' },
  { id: 'coming', label: 'Coming Soon' },
] as const;

const LISTING_STATUS = [
  { id: 'active', label: 'Active' },
  { id: 'closing', label: 'Closing Soon' },
] as const;

function isTokenized(listing: Listing) {
  return listing.tokenizationMode === 'LIVE' && Boolean(listing.token || listing.onChainListingId);
}

function isComingSoon(listing: Listing) {
  return !isTokenized(listing) && listing.status === 'OPEN' && !listing.onChainListingId;
}

function isClosingSoon(listing: Listing) {
  return listing.status === 'PARTIALLY_FILLED';
}

function isVerified(listing: Listing) {
  return Boolean(listing.valuation?.payload?.amount || listing.askPrice > 0);
}

function valuationOf(listing: Listing) {
  return listing.valuation?.payload?.amount ?? listing.askPrice ?? 0;
}

function tokenSupply(listing: Listing) {
  return listing.totalTokenSupply ?? listing.token?.supply ?? 0;
}

function tokensRemaining(listing: Listing) {
  if (listing.availableTokenUnits != null) return listing.availableTokenUnits;
  return tokenSupply(listing);
}

function pricePerToken(listing: Listing) {
  const supply = tokenSupply(listing);
  const value = valuationOf(listing);
  if (supply > 0 && value > 0) return value / supply;
  if (listing.pricePerTokenWei) {
    const wei = Number(listing.pricePerTokenWei);
    if (Number.isFinite(wei) && wei > 0) return wei / 1e18;
  }
  return 10;
}

function targetIrr(listing: Listing) {
  if (typeof listing.leaseRate === 'number' && listing.leaseRate > 0) {
    return listing.leaseRate;
  }
  // Stable illustrative IRR when the listing has no lease/yield mark yet.
  let hash = 0;
  for (const char of listing.id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return 6.5 + (hash % 70) / 10;
}

function categoryOf(listing: Listing): CategoryId {
  const haystack = `${listing.title} ${listing.asset?.name ?? ''} ${listing.summary ?? ''}`.toLowerCase();
  if (/hotel|resort|hospitality/.test(haystack)) return 'HOSPITALITY';
  const assetClass = listing.asset?.assetClass;
  if (assetClass === 'REAL_ESTATE') return 'REAL_ESTATE';
  if (assetClass === 'INFRASTRUCTURE') return 'INFRASTRUCTURE';
  if (assetClass === 'AGRICULTURE') return 'AGRICULTURE';
  if (assetClass === 'PRIVATE_CREDIT') return 'PRIVATE_CREDIT';
  return 'ALL';
}

function subtypeLabel(listing: Listing) {
  const assetClass = listing.asset?.assetClass;
  if (assetClass === 'REAL_ESTATE') {
    const haystack = `${listing.title} ${listing.summary ?? ''}`.toLowerCase();
    if (/villa|residential|home|apartment/.test(haystack)) return 'Residential';
    if (/office|tower|commercial/.test(haystack)) return 'Commercial';
    return 'Real estate';
  }
  if (assetClass && assetClassLabel[assetClass]) return assetClassLabel[assetClass];
  return 'Private asset';
}

function formatTokens(value: number) {
  return value.toLocaleString('en-US');
}

function formatIrr(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatTokenPrice(value: number) {
  if (value >= 1000) return moneyCompact(value);
  if (value >= 1) return `$${value.toFixed(value >= 10 ? 0 : 2)}`;
  return `$${value.toFixed(2)}`;
}

export function BuyerMarketplace() {
  const listingsQuery = useQuery({
    queryKey: ['marketplace', 'buyer'],
    queryFn: async () => (await api.get<{ listings: Listing[] }>('/marketplace')).data.listings,
  });

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortId>('newest');
  const [view, setView] = useState<ViewMode>('grid');
  const [wishlist, setWishlist] = useState<Set<string>>(() => new Set());
  const [assetClassFilters, setAssetClassFilters] = useState<Set<CategoryId>>(() => new Set());
  const [returnFilters, setReturnFilters] = useState<Set<string>>(() => new Set());
  const [tokenFilters, setTokenFilters] = useState<Set<string>>(() => new Set());
  const [statusFilters, setStatusFilters] = useState<Set<string>>(() => new Set(['active']));
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [rangeMax, setRangeMax] = useState(500);

  const allListings = listingsQuery.data ?? [];
  const browseable = useMemo(
    () =>
      allListings.filter((listing) =>
        ['OPEN', 'PARTIALLY_FILLED'].includes(listing.status),
      ),
    [allListings],
  );

  const categoryCounts = useMemo(() => {
    const counts: Record<CategoryId, number> = {
      ALL: browseable.length,
      REAL_ESTATE: 0,
      INFRASTRUCTURE: 0,
      AGRICULTURE: 0,
      PRIVATE_CREDIT: 0,
      HOSPITALITY: 0,
    };
    for (const listing of browseable) {
      const id = categoryOf(listing);
      if (id !== 'ALL') counts[id] += 1;
    }
    return counts;
  }, [browseable]);

  const locations = useMemo(() => {
    const countries = new Set<string>();
    const cities = new Set<string>();
    for (const listing of browseable) {
      const location = listing.asset?.location?.trim();
      const jurisdiction = listing.asset?.jurisdiction?.trim();
      if (jurisdiction) countries.add(jurisdiction);
      if (location) {
        const [cityPart, countryPart] = location.split(',').map((part) => part.trim());
        if (cityPart) cities.add(cityPart);
        if (countryPart) countries.add(countryPart);
        else if (!jurisdiction && location) countries.add(location);
      }
    }
    return {
      countries: [...countries].sort(),
      cities: [...cities].sort(),
    };
  }, [browseable]);

  const filterCounts = useMemo(() => {
    const byClass: Record<string, number> = {};
    for (const item of CATEGORIES) {
      if (item.id === 'ALL') continue;
      byClass[item.id] = categoryCounts[item.id];
    }
    return byClass;
  }, [categoryCounts]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    let rows = browseable.filter((listing) => {
      if (assetClassFilters.size > 0) {
        const listingCategory = categoryOf(listing);
        if (!assetClassFilters.has(listingCategory)) return false;
      }

      if (term) {
        const haystack = [
          listing.title,
          listing.asset?.name,
          listing.asset?.location,
          listing.asset?.jurisdiction,
          listing.summary,
          listing.asset?.assetClass ? assetClassLabel[listing.asset.assetClass] : '',
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }

      if (country) {
        const location = `${listing.asset?.location ?? ''} ${listing.asset?.jurisdiction ?? ''}`.toLowerCase();
        if (!location.includes(country.toLowerCase())) return false;
      }
      if (city) {
        const location = (listing.asset?.location ?? '').toLowerCase();
        if (!location.includes(city.toLowerCase())) return false;
      }

      const valueM = valuationOf(listing) / 1_000_000;
      if (valueM > rangeMax) return false;

      const irr = targetIrr(listing);
      if (returnFilters.size > 0) {
        const matched = RETURN_BANDS.some(
          (band) => returnFilters.has(band.id) && irr >= band.min && irr < band.max,
        );
        if (!matched) return false;
      }

      if (tokenFilters.size > 0) {
        const flags = {
          verified: isVerified(listing),
          tokenized: isTokenized(listing),
          coming: isComingSoon(listing),
        };
        if (![...tokenFilters].some((id) => flags[id as keyof typeof flags])) return false;
      }

      if (statusFilters.size > 0) {
        const active = listing.status === 'OPEN' || listing.status === 'PARTIALLY_FILLED';
        const closing = isClosingSoon(listing);
        if (statusFilters.has('active') && statusFilters.has('closing')) {
          if (!active) return false;
        } else if (statusFilters.has('active')) {
          if (!active) return false;
        } else if (statusFilters.has('closing') && !closing) {
          return false;
        }
      }

      return true;
    });

    rows = [...rows].sort((a, b) => {
      if (sort === 'value_desc') return valuationOf(b) - valuationOf(a);
      if (sort === 'value_asc') return valuationOf(a) - valuationOf(b);
      if (sort === 'irr_desc') return targetIrr(b) - targetIrr(a);
      return String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''));
    });

    return rows;
  }, [
    assetClassFilters,
    browseable,
    city,
    country,
    query,
    rangeMax,
    returnFilters,
    sort,
    statusFilters,
    tokenFilters,
  ]);

  const featuredId = useMemo(() => {
    if (!browseable.length) return null;
    return [...browseable].sort((a, b) => valuationOf(b) - valuationOf(a))[0]?.id ?? null;
  }, [browseable]);

  function toggleSet<T>(set: Set<T>, value: T, updater: (next: Set<T>) => void) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    updater(next);
  }

  function clearFilters() {
    setAssetClassFilters(new Set());
    setReturnFilters(new Set());
    setTokenFilters(new Set());
    setStatusFilters(new Set(['active']));
    setCountry('');
    setCity('');
    setRangeMax(500);
    setQuery('');
  }

  return (
    <div className="buyer-mkt mx-auto w-full max-w-[96rem]">
      <section className="buyer-mkt__hero">
        <div className="buyer-mkt__hero-copy">
          <p className="buyer-mkt__eyebrow">Marketplace</p>
          <h1 className="buyer-mkt__title">Invest in real-world assets</h1>
          <p className="buyer-mkt__lead">
            Access verified, tokenized private assets across real estate, infrastructure, agriculture
            and more.
          </p>
          <ul className="buyer-mkt__pillars">
            {[
              { icon: ShieldCheck, label: 'Verified assets' },
              { icon: PieChart, label: 'Transparent data' },
              { icon: Lock, label: 'Secure transactions' },
              { icon: Building2, label: 'Fractional ownership' },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.label}>
                  <Icon size={15} strokeWidth={1.75} aria-hidden="true" />
                  <span>{item.label}</span>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="buyer-mkt__hero-media">
          <Image
            src="/buyer-dashboard-hero.jpg"
            alt=""
            fill
            priority
            sizes="(max-width: 1100px) 100vw, 42vw"
            className="object-cover object-center"
            unoptimized
          />
          <div className="buyer-mkt__hero-caption">
            <p>Real assets. Real opportunities.</p>
          </div>
        </div>
      </section>

      <div className="buyer-mkt__layout">
        <div className="buyer-mkt__main">
          <div className="buyer-mkt__toolbar">
            <label className="buyer-mkt__search">
              <Search size={15} aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by name, location, or asset class"
              />
            </label>
            <label className="buyer-mkt__sort">
              <span>Sort by</span>
              <select value={sort} onChange={(event) => setSort(event.target.value as SortId)}>
                <option value="newest">Newest first</option>
                <option value="value_desc">Highest valuation</option>
                <option value="value_asc">Lowest valuation</option>
                <option value="irr_desc">Highest target IRR</option>
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </label>
            <div className="buyer-mkt__view-toggle" role="group" aria-label="View mode">
              <button
                type="button"
                className={cn(view === 'grid' && 'is-active')}
                aria-pressed={view === 'grid'}
                onClick={() => setView('grid')}
              >
                <LayoutGrid size={15} />
              </button>
              <button
                type="button"
                className={cn(view === 'list' && 'is-active')}
                aria-pressed={view === 'list'}
                onClick={() => setView('list')}
              >
                <List size={15} />
              </button>
            </div>
          </div>

          <p className="buyer-mkt__count">
            {visible.length
              ? `Showing 1–${visible.length} of ${visible.length} assets`
              : 'No assets match the current filters'}
          </p>

          {listingsQuery.isLoading ? (
            <div className={cn('buyer-mkt__grid', view === 'list' && 'buyer-mkt__grid--list')}>
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="buyer-mkt__card buyer-mkt__card--skeleton" />
              ))}
            </div>
          ) : visible.length ? (
            <div className={cn('buyer-mkt__grid', view === 'list' && 'buyer-mkt__grid--list')}>
              {visible.map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  featured={listing.id === featuredId}
                  wished={wishlist.has(listing.id)}
                  compact={view === 'list'}
                  onToggleWish={() =>
                    setWishlist((current) => {
                      const next = new Set(current);
                      if (next.has(listing.id)) next.delete(listing.id);
                      else next.add(listing.id);
                      return next;
                    })
                  }
                />
              ))}
            </div>
          ) : (
            <div className="buyer-mkt__empty">
              <h2>No listings match this view</h2>
              <p>Try clearing filters or switching to another asset class.</p>
              <button type="button" onClick={clearFilters}>
                Clear all filters
              </button>
            </div>
          )}
        </div>

        <aside className="buyer-mkt__filters" aria-label="Filters">
          <div className="buyer-mkt__filters-head">
            <h2>Filters</h2>
            <button type="button" onClick={clearFilters}>
              Clear all
            </button>
          </div>

          <div className="buyer-mkt__filter-block">
            <h3>Asset Class</h3>
            <div className="buyer-mkt__checks">
              {CATEGORIES.filter((item) => item.id !== 'ALL').map((item) => (
                <label key={item.id} className="buyer-mkt__check">
                  <input
                    type="checkbox"
                    checked={assetClassFilters.has(item.id)}
                    onChange={() =>
                      toggleSet(assetClassFilters, item.id, setAssetClassFilters)
                    }
                  />
                  <span>{item.label}</span>
                  <em>{filterCounts[item.id] ?? 0}</em>
                </label>
              ))}
            </div>
          </div>

          <div className="buyer-mkt__filter-block">
            <h3>Location</h3>
            <label className="buyer-mkt__select">
              <select value={country} onChange={(event) => setCountry(event.target.value)}>
                <option value="">Select country</option>
                {locations.countries.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </label>
            <label className="buyer-mkt__select">
              <select value={city} onChange={(event) => setCity(event.target.value)}>
                <option value="">Select city / region</option>
                {locations.cities.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </label>
          </div>

          <div className="buyer-mkt__filter-block">
            <h3>Investment Range (USD)</h3>
            <div className="buyer-mkt__range">
              <input
                type="range"
                min={0}
                max={500}
                step={5}
                value={rangeMax}
                onChange={(event) => setRangeMax(Number(event.target.value))}
              />
              <div className="buyer-mkt__range-labels">
                <span>$0</span>
                <span>Up to ${rangeMax}M</span>
                <span>$500M</span>
              </div>
            </div>
          </div>

          <div className="buyer-mkt__filter-block">
            <h3>Expected Annual Return</h3>
            <div className="buyer-mkt__checks">
              {RETURN_BANDS.map((band) => (
                <label key={band.id} className="buyer-mkt__check">
                  <input
                    type="checkbox"
                    checked={returnFilters.has(band.id)}
                    onChange={() => toggleSet(returnFilters, band.id, setReturnFilters)}
                  />
                  <span>{band.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="buyer-mkt__filter-block">
            <h3>Tokenization Status</h3>
            <div className="buyer-mkt__checks">
              {TOKEN_STATUS.map((item) => (
                <label key={item.id} className="buyer-mkt__check">
                  <input
                    type="checkbox"
                    checked={tokenFilters.has(item.id)}
                    onChange={() => toggleSet(tokenFilters, item.id, setTokenFilters)}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="buyer-mkt__filter-block">
            <h3>Listing Status</h3>
            <div className="buyer-mkt__checks">
              {LISTING_STATUS.map((item) => (
                <label key={item.id} className="buyer-mkt__check">
                  <input
                    type="checkbox"
                    checked={statusFilters.has(item.id)}
                    onChange={() => toggleSet(statusFilters, item.id, setStatusFilters)}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ListingCard({
  listing,
  featured,
  wished,
  compact,
  onToggleWish,
}: {
  listing: Listing;
  featured: boolean;
  wished: boolean;
  compact: boolean;
  onToggleWish: () => void;
}) {
  const image =
    listing.imageUrl || listing.asset?.primaryImageUrl || listing.asset?.imageUrls?.[0];
  const coming = isComingSoon(listing);
  const tokenized = isTokenized(listing);
  const verified = isVerified(listing);
  const value = valuationOf(listing);
  const supply = tokenSupply(listing);
  const remaining = tokensRemaining(listing);
  const sold = Math.max(0, supply - remaining);
  const progress = supply > 0 ? Math.min(100, Math.round((sold / supply) * 100)) : coming ? 0 : 72;
  const irr = targetIrr(listing);
  const unitPrice = pricePerToken(listing);
  const location = listing.asset?.location || listing.asset?.jurisdiction || 'Global';

  const badges: Array<{ label: string; tone: 'ok' | 'info' | 'gold' | 'muted' }> = [];
  if (coming) badges.push({ label: 'Coming Soon', tone: 'muted' });
  else {
    if (verified) badges.push({ label: 'Verified', tone: 'ok' });
    if (tokenized) badges.push({ label: 'Tokenized', tone: 'info' });
    if (featured) badges.push({ label: 'Featured', tone: 'gold' });
  }

  return (
    <article className={cn('buyer-mkt__card', compact && 'buyer-mkt__card--list')}>
      <div className="buyer-mkt__card-media">
        {image ? (
          <Image src={image} alt="" fill sizes="280px" className="object-cover" unoptimized />
        ) : (
          <div className="buyer-mkt__card-fallback">
            {(listing.asset?.name ?? listing.title).slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="buyer-mkt__badges">
          {badges.map((badge) => (
            <span key={badge.label} className={cn('buyer-mkt__badge', `buyer-mkt__badge--${badge.tone}`)}>
              {badge.label}
            </span>
          ))}
        </div>
        <button
          type="button"
          className={cn('buyer-mkt__wish', wished && 'is-active')}
          aria-label={wished ? 'Remove from wishlist' : 'Save to wishlist'}
          onClick={onToggleWish}
        >
          <Heart size={15} fill={wished ? 'currentColor' : 'none'} />
        </button>
      </div>

      <div className="buyer-mkt__card-body">
        <h3>{listing.title || listing.asset?.name}</h3>
        <p className="buyer-mkt__meta">
          <MapPin size={13} aria-hidden="true" />
          <span>
            {location}
            {' · '}
            {subtypeLabel(listing)}
          </span>
        </p>

        <dl className="buyer-mkt__metrics">
          <div>
            <dt>Valuation</dt>
            <dd>{moneyCompact(value)}</dd>
          </div>
          <div>
            <dt>Price / token</dt>
            <dd>{formatTokenPrice(unitPrice)}</dd>
          </div>
          <div>
            <dt>Target IRR</dt>
            <dd>{formatIrr(irr)}</dd>
          </div>
        </dl>

        <div className="buyer-mkt__progress">
          <span className="buyer-mkt__meter">
            <span style={{ width: `${progress}%` }} />
          </span>
          <p>
            {supply > 0
              ? `${formatTokens(sold || Math.round((progress / 100) * supply))} / ${formatTokens(supply)} tokens`
              : coming
                ? 'Allocation opens soon'
                : 'Token allocation available'}
          </p>
        </div>

        <div className="buyer-mkt__card-actions">
          <Link href="/trading" className="buyer-mkt__btn">
            View details
          </Link>
          {coming ? (
            <button type="button" className="buyer-mkt__btn buyer-mkt__btn--ghost">
              <Bell size={14} />
              Notify me
            </button>
          ) : (
            <Link href="/trading" className="buyer-mkt__btn buyer-mkt__btn--primary">
              Invest now
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
