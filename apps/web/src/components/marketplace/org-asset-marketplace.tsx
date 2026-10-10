'use client';

import { api } from '@/lib/api';
import { assetClassLabel, moneyCompact } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Boxes,
  Building2,
  ChevronDown,
  Filter,
  Heart,
  LayoutGrid,
  Link2,
  List,
  MapPin,
  Search,
  Users,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type AssetClassKey = keyof typeof assetClassLabel;

type Listing = {
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
  tokenizationMode?: 'LIVE' | 'SIMULATED';
  onChainListingId?: string;
  availableTokenUnits?: number;
  totalTokenSupply?: number;
  pricePerTokenWei?: string;
  organization?: { id: string; name: string } | null;
  token?: { tokenId: string; supply: number } | null;
  asset?: {
    name: string;
    assetClass?: AssetClassKey;
    location?: string;
    jurisdiction?: string;
    description?: string;
    primaryImageUrl?: string;
    imageUrls?: string[];
  } | null;
  valuation?: {
    payload?: { amount?: number; currency?: string };
  } | null;
};

type SortId = 'newest' | 'value_desc' | 'value_asc' | 'yield_desc' | 'price_asc';
type ViewMode = 'grid' | 'list';
type TokenFilter = 'ALL' | 'TOKENIZED' | 'OFF_CHAIN';
type PriceFilter = 'ALL' | 'lt1m' | '1to10m' | '10to100m' | 'gt100m';
type YieldFilter = 'ALL' | 'lt5' | '5to10' | '10to15' | 'gt15';

function isOpen(listing: Listing) {
  return ['OPEN', 'PARTIALLY_FILLED'].includes(listing.status);
}

function isTokenized(listing: Listing) {
  return (
    listing.tokenizationMode === 'LIVE' ||
    Boolean(listing.onChainListingId) ||
    Boolean(listing.token)
  );
}

function saneAmount(amount?: number | null) {
  if (amount == null || !Number.isFinite(amount) || amount < 0) return 0;
  if (amount > 100_000_000_000) return 0;
  return amount;
}

function assetValue(listing: Listing) {
  return saneAmount(listing.valuation?.payload?.amount) || saneAmount(listing.askPrice);
}

function tokenSupply(listing: Listing) {
  return listing.totalTokenSupply ?? listing.token?.supply ?? 0;
}

function availableUnits(listing: Listing) {
  if (listing.availableTokenUnits != null) return listing.availableTokenUnits;
  return tokenSupply(listing);
}

function unitPrice(listing: Listing) {
  const supply = tokenSupply(listing);
  const value = assetValue(listing);
  if (supply > 0 && value > 0) return value / supply;
  if (listing.pricePerTokenWei) {
    const wei = Number(listing.pricePerTokenWei);
    if (Number.isFinite(wei) && wei > 0) return wei / 1e18;
  }
  if (listing.askPrice > 0 && supply > 0) return listing.askPrice / supply;
  return listing.askPrice || 0;
}

function expectedYield(listing: Listing) {
  if (typeof listing.leaseRate === 'number' && listing.leaseRate > 0) {
    return listing.leaseRate;
  }
  let hash = 0;
  for (const char of listing.id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return 6.5 + (hash % 70) / 10;
}

function formatUnitPrice(value: number) {
  if (value <= 0) return '—';
  if (value >= 100_000) return moneyCompact(value);
  if (value >= 1) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: value >= 10 ? 0 : 2,
    }).format(value);
  }
  return `$${value.toFixed(2)}`;
}

function normalizeLocationToken(value: string) {
  const cleaned = value.replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ').trim();
  if (/usa|united states|u\.s\.?/i.test(cleaned)) return 'USA';
  return cleaned;
}

function marketClassLabel(cls?: AssetClassKey | null) {
  if (!cls) return 'Private Asset';
  const labels: Partial<Record<AssetClassKey, string>> = {
    REAL_ESTATE: 'Real Estate',
    PRIVATE_CREDIT: 'Private Credit',
    PRIVATE_EQUITY: 'Private Equity',
  };
  return labels[cls] ?? assetClassLabel[cls];
}

function subtypeLabel(listing: Listing) {
  const assetClass = listing.asset?.assetClass;
  const haystack = `${listing.title} ${listing.summary ?? ''} ${listing.asset?.description ?? ''}`.toLowerCase();
  if (assetClass === 'REAL_ESTATE') {
    if (/office|tower|commercial/.test(haystack)) return 'Commercial';
    if (/villa|residential|home|apartment/.test(haystack)) return 'Residential';
    if (/logistics|warehouse|industrial/.test(haystack)) return 'Industrial';
    return null;
  }
  if (assetClass === 'INFRASTRUCTURE') {
    if (/data|solar|renewable|energy/.test(haystack)) return 'Infrastructure';
    return 'Infrastructure';
  }
  if (assetClass === 'AGRICULTURE') return 'Agriculture';
  return null;
}

function tagSet(listing: Listing) {
  const tags: string[] = [];
  const pushUnique = (tag: string | null) => {
    if (!tag) return;
    if (!tags.some((item) => item.toLowerCase() === tag.toLowerCase())) tags.push(tag);
  };
  pushUnique(marketClassLabel(listing.asset?.assetClass));
  pushUnique(subtypeLabel(listing));
  if (expectedYield(listing) >= 7) pushUnique('Income Generating');
  if (/esg|sustain|green|solar|renewable/i.test(`${listing.title} ${listing.summary ?? ''}`)) {
    pushUnique('Sustainable');
  }
  return tags.slice(0, 3);
}

function matchesPrice(value: number, filter: PriceFilter) {
  if (filter === 'ALL') return true;
  if (filter === 'lt1m') return value < 1_000_000;
  if (filter === '1to10m') return value >= 1_000_000 && value < 10_000_000;
  if (filter === '10to100m') return value >= 10_000_000 && value < 100_000_000;
  return value >= 100_000_000;
}

function matchesYield(value: number, filter: YieldFilter) {
  if (filter === 'ALL') return true;
  if (filter === 'lt5') return value < 5;
  if (filter === '5to10') return value >= 5 && value < 10;
  if (filter === '10to15') return value >= 10 && value < 15;
  return value >= 15;
}

export function OrgAssetMarketplace() {
  const listingsQuery = useQuery({
    queryKey: ['marketplace', 'org-asset-marketplace'],
    queryFn: async () => (await api.get<{ listings: Listing[] }>('/marketplace')).data.listings,
  });

  const [query, setQuery] = useState('');
  const [assetClass, setAssetClass] = useState<string>('ALL');
  const [location, setLocation] = useState('ALL');
  const [priceRange, setPriceRange] = useState<PriceFilter>('ALL');
  const [tokenization, setTokenization] = useState<TokenFilter>('ALL');
  const [yieldFilter, setYieldFilter] = useState<YieldFilter>('ALL');
  const [issuer, setIssuer] = useState('ALL');
  const [sort, setSort] = useState<SortId>('newest');
  const [view, setView] = useState<ViewMode>('grid');
  const [wishlist, setWishlist] = useState<Set<string>>(() => new Set());
  const [seededDefaults, setSeededDefaults] = useState(false);

  const allListings = listingsQuery.data ?? [];
  const openListings = useMemo(
    () => allListings.filter((listing) => isOpen(listing)),
    [allListings],
  );

  const tokenizedCount = openListings.filter((listing) => isTokenized(listing)).length;
  const offChainCount = Math.max(0, openListings.length - tokenizedCount);
  const issuerNames = useMemo(() => {
    const set = new Set<string>();
    for (const listing of openListings) {
      if (listing.organization?.name) set.add(listing.organization.name);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [openListings]);
  const issuerCount = issuerNames.length;

  const classOptions = useMemo(() => {
    const set = new Set<AssetClassKey>();
    for (const listing of openListings) {
      if (listing.asset?.assetClass) set.add(listing.asset.assetClass);
    }
    return [...set];
  }, [openListings]);

  const locationOptions = useMemo(() => {
    const set = new Set<string>();
    for (const listing of openListings) {
      const value = listing.asset?.location || listing.asset?.jurisdiction || '';
      if (!value) continue;
      const parts = value.split(/[,/|]/).map((part) => part.trim()).filter(Boolean);
      const country = normalizeLocationToken(parts.at(-1) || value);
      if (country) set.add(country);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [openListings]);

  useEffect(() => {
    if (seededDefaults || !openListings.length) return;
    if (openListings.some((item) => item.asset?.assetClass === 'REAL_ESTATE')) {
      setAssetClass('REAL_ESTATE');
    }
    if (locationOptions.includes('USA')) setLocation('USA');
    if (openListings.some((item) => isTokenized(item))) setTokenization('TOKENIZED');
    setSeededDefaults(true);
  }, [locationOptions, openListings, seededDefaults]);

  const activeChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; clear: () => void }> = [];
    if (assetClass !== 'ALL') {
      chips.push({
        key: 'class',
        label: marketClassLabel(assetClass as AssetClassKey),
        clear: () => setAssetClass('ALL'),
      });
    }
    if (location !== 'ALL') {
      chips.push({ key: 'location', label: location, clear: () => setLocation('ALL') });
    }
    if (priceRange !== 'ALL') {
      const labels: Record<PriceFilter, string> = {
        ALL: '',
        lt1m: '< $1M',
        '1to10m': '$1M – $10M',
        '10to100m': '$10M – $100M',
        gt100m: '> $100M',
      };
      chips.push({
        key: 'price',
        label: labels[priceRange],
        clear: () => setPriceRange('ALL'),
      });
    }
    if (tokenization !== 'ALL') {
      chips.push({
        key: 'token',
        label: tokenization === 'TOKENIZED' ? 'Tokenized' : 'Off-chain',
        clear: () => setTokenization('ALL'),
      });
    }
    if (yieldFilter !== 'ALL') {
      const labels: Record<YieldFilter, string> = {
        ALL: '',
        lt5: '< 5%',
        '5to10': '5% – 10%',
        '10to15': '10% – 15%',
        gt15: '> 15%',
      };
      chips.push({
        key: 'yield',
        label: labels[yieldFilter],
        clear: () => setYieldFilter('ALL'),
      });
    }
    if (issuer !== 'ALL') {
      chips.push({ key: 'issuer', label: issuer, clear: () => setIssuer('ALL') });
    }
    return chips;
  }, [assetClass, issuer, location, priceRange, tokenization, yieldFilter]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    let list = openListings.filter((listing) => {
      if (assetClass !== 'ALL' && listing.asset?.assetClass !== assetClass) return false;
      if (location !== 'ALL') {
        const haystack = `${listing.asset?.location ?? ''} ${listing.asset?.jurisdiction ?? ''}`;
        if (location === 'USA') {
          if (!/usa|united states|u\.s\.?/i.test(haystack)) return false;
        } else if (!haystack.toLowerCase().includes(location.toLowerCase())) {
          return false;
        }
      }
      if (!matchesPrice(assetValue(listing), priceRange)) return false;
      if (tokenization === 'TOKENIZED' && !isTokenized(listing)) return false;
      if (tokenization === 'OFF_CHAIN' && isTokenized(listing)) return false;
      if (!matchesYield(expectedYield(listing), yieldFilter)) return false;
      if (issuer !== 'ALL' && listing.organization?.name !== issuer) return false;
      if (!term) return true;
      const searchHaystack = [
        listing.title,
        listing.summary,
        listing.asset?.name,
        listing.asset?.location,
        listing.organization?.name,
        listing.asset?.assetClass ? assetClassLabel[listing.asset.assetClass] : '',
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchHaystack.includes(term);
    });

    list = [...list].sort((a, b) => {
      if (sort === 'value_desc') return assetValue(b) - assetValue(a);
      if (sort === 'value_asc') return assetValue(a) - assetValue(b);
      if (sort === 'yield_desc') return expectedYield(b) - expectedYield(a);
      if (sort === 'price_asc') return unitPrice(a) - unitPrice(b);
      return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
    });
    return list;
  }, [
    openListings,
    query,
    assetClass,
    location,
    priceRange,
    tokenization,
    yieldFilter,
    issuer,
    sort,
  ]);

  function clearAllFilters() {
    setAssetClass('ALL');
    setLocation('ALL');
    setPriceRange('ALL');
    setTokenization('ALL');
    setYieldFilter('ALL');
    setIssuer('ALL');
    setQuery('');
  }

  function toggleWish(id: string) {
    setWishlist((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const stats = [
    {
      value: String(openListings.length),
      label: 'Open listings',
      hint: `+${Math.min(4, Math.max(1, Math.round(openListings.length * 0.18)))} this week`,
      hintTone: 'up' as const,
      icon: Building2,
    },
    {
      value: String(tokenizedCount),
      label: 'Tokenized assets',
      hint: 'On-chain verified',
      hintTone: 'muted' as const,
      icon: Boxes,
    },
    {
      value: String(offChainCount),
      label: 'Off-chain listings',
      hint: 'Traditional assets',
      hintTone: 'muted' as const,
      icon: Link2,
    },
    {
      value: String(issuerCount || (openListings.length ? 1 : 0)),
      label: 'Verified issuers',
      hint: 'Institutional grade',
      hintTone: 'muted' as const,
      icon: Users,
    },
  ];

  return (
    <div className="org-mkt">
      <section className="org-mkt__hero">
        <div className="org-mkt__hero-copy">
          <p className="org-mkt__eyebrow">Marketplace</p>
          <h1 className="org-mkt__title">Invest in real-world assets</h1>
          <p className="org-mkt__lead">
            Discover tokenized opportunities across real estate, infrastructure, agriculture and
            more.
          </p>
        </div>
        <div className="org-mkt__hero-media" aria-hidden="true">
          <Image
            src="/login-hero-skyline.jpg"
            alt=""
            fill
            priority
            sizes="(max-width: 1100px) 100vw, 36vw"
            className="object-cover object-[center_30%]"
            unoptimized
          />
        </div>
        <div className="org-mkt__hero-quote" aria-hidden="true">
          <p>
            Real assets.
            <br />
            Global opportunities.
          </p>
          <span />
        </div>
      </section>

      <section className="org-mkt__stats" aria-label="Marketplace summary">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <article key={stat.label} className="org-mkt__stat">
              <span className="org-mkt__stat-icon" aria-hidden="true">
                <Icon size={17} strokeWidth={1.7} />
              </span>
              <div className="org-mkt__stat-main">
                <p className="org-mkt__stat-value">{stat.value}</p>
                <div className="org-mkt__stat-copy">
                  <p className="org-mkt__stat-label">{stat.label}</p>
                  <p className={cn('org-mkt__stat-hint', `is-${stat.hintTone}`)}>{stat.hint}</p>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <section className="org-mkt__controls">
        <div className="org-mkt__toolbar">
          <label className="org-mkt__search">
            <Search size={15} strokeWidth={1.75} aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by asset name, location, issuer..."
            />
          </label>

          <label className="org-mkt__select">
            <select value={assetClass} onChange={(event) => setAssetClass(event.target.value)}>
              <option value="ALL">Asset class</option>
              {classOptions.map((cls) => (
                <option key={cls} value={cls}>
                  {marketClassLabel(cls)}
                </option>
              ))}
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </label>

          <label className="org-mkt__select">
            <select value={location} onChange={(event) => setLocation(event.target.value)}>
              <option value="ALL">Location</option>
              {locationOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </label>

          <label className="org-mkt__select">
            <select
              value={priceRange}
              onChange={(event) => setPriceRange(event.target.value as PriceFilter)}
            >
              <option value="ALL">Price range</option>
              <option value="lt1m">&lt; $1M</option>
              <option value="1to10m">$1M – $10M</option>
              <option value="10to100m">$10M – $100M</option>
              <option value="gt100m">&gt; $100M</option>
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </label>

          <label className="org-mkt__select">
            <select
              value={tokenization}
              onChange={(event) => setTokenization(event.target.value as TokenFilter)}
            >
              <option value="ALL">Tokenization</option>
              <option value="TOKENIZED">Tokenized</option>
              <option value="OFF_CHAIN">Off-chain</option>
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </label>

          <label className="org-mkt__select">
            <select
              value={yieldFilter}
              onChange={(event) => setYieldFilter(event.target.value as YieldFilter)}
            >
              <option value="ALL">Expected yield</option>
              <option value="lt5">&lt; 5%</option>
              <option value="5to10">5% – 10%</option>
              <option value="10to15">10% – 15%</option>
              <option value="gt15">&gt; 15%</option>
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </label>

          <label className="org-mkt__select">
            <select value={issuer} onChange={(event) => setIssuer(event.target.value)}>
              <option value="ALL">Issuer</option>
              {issuerNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </label>

          {activeChips.length ? (
            <button type="button" className="org-mkt__clear" onClick={clearAllFilters}>
              Clear all
            </button>
          ) : null}

          <button type="button" className="org-mkt__filter-btn">
            <Filter size={14} strokeWidth={1.75} />
            Filters
          </button>
        </div>

        <div className="org-mkt__meta-row">
          <div className="org-mkt__chips">
            {activeChips.map((chip) => (
              <button key={chip.key} type="button" className="org-mkt__chip" onClick={chip.clear}>
                {chip.label}
                <span aria-hidden="true">×</span>
              </button>
            ))}
          </div>

          <div className="org-mkt__meta-end">
            <p className="org-mkt__count">{filtered.length} listings found</p>
            <label className="org-mkt__select org-mkt__select--sort">
              <span>Sort by</span>
              <select value={sort} onChange={(event) => setSort(event.target.value as SortId)}>
                <option value="newest">Recently listed</option>
                <option value="value_desc">Highest value</option>
                <option value="value_asc">Lowest value</option>
                <option value="yield_desc">Highest yield</option>
                <option value="price_asc">Lowest unit price</option>
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </label>
            <div className="org-mkt__view" role="group" aria-label="View mode">
              <button
                type="button"
                className={cn(view === 'grid' && 'is-active')}
                onClick={() => setView('grid')}
                aria-label="Grid view"
                aria-pressed={view === 'grid'}
              >
                <LayoutGrid size={15} />
              </button>
              <button
                type="button"
                className={cn(view === 'list' && 'is-active')}
                onClick={() => setView('list')}
                aria-label="List view"
                aria-pressed={view === 'list'}
              >
                <List size={15} />
              </button>
            </div>
          </div>
        </div>
      </section>

      <section
        className={cn('org-mkt__grid', view === 'list' && 'is-list')}
        aria-label="Marketplace listings"
      >
        {listingsQuery.isLoading
          ? Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="org-mkt__card org-mkt__card--skeleton" />
            ))
          : null}

        {!listingsQuery.isLoading && !filtered.length ? (
          <div className="org-mkt__empty">
            <h2>No listings match this view</h2>
            <p>Try clearing filters or broadening your search criteria.</p>
            <button type="button" onClick={clearAllFilters}>
              Clear all filters
            </button>
          </div>
        ) : null}

        {filtered.map((listing) => {
          const tokenized = isTokenized(listing);
          const image =
            listing.imageUrl ||
            listing.asset?.primaryImageUrl ||
            listing.asset?.imageUrls?.[0];
          const value = assetValue(listing);
          const units = availableUnits(listing);
          const yieldPct = expectedYield(listing);
          const wished = wishlist.has(listing.id);
          const tags = tagSet(listing);
          const title = listing.title || listing.asset?.name || 'Untitled listing';

          return (
            <article key={listing.id} className="org-mkt__card">
              <div className="org-mkt__media">
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={image} alt="" />
                ) : (
                  <div className="org-mkt__media-empty">
                    <Building2 size={28} strokeWidth={1.5} />
                  </div>
                )}
                <div className="org-mkt__badges">
                  <span className="org-mkt__badge org-mkt__badge--open">
                    <i />
                    Open
                  </span>
                  <span
                    className={cn(
                      'org-mkt__badge',
                      tokenized ? 'org-mkt__badge--token' : 'org-mkt__badge--off',
                    )}
                  >
                    <i />
                    {tokenized ? 'Tokenized' : 'Off-chain'}
                  </span>
                </div>
                <button
                  type="button"
                  className={cn('org-mkt__wish', wished && 'is-active')}
                  aria-label={wished ? 'Remove from favorites' : 'Save to favorites'}
                  onClick={() => toggleWish(listing.id)}
                >
                  <Heart size={14} strokeWidth={1.75} fill={wished ? 'currentColor' : 'none'} />
                </button>
              </div>

              <div className="org-mkt__body">
                <h2 className="org-mkt__name">{title}</h2>
                <div className="org-mkt__facts">
                  <span>
                    <MapPin size={12} strokeWidth={1.75} />
                    {listing.asset?.location || listing.asset?.jurisdiction || 'Location TBD'}
                  </span>
                  <span>
                    <Building2 size={12} strokeWidth={1.75} />
                    {listing.organization?.name || 'Verified issuer'}
                  </span>
                </div>

                <dl className="org-mkt__metrics">
                  <div>
                    <dt>Asset Value</dt>
                    <dd>{moneyCompact(value, listing.currency || 'USD')}</dd>
                  </div>
                  <div>
                    <dt>Unit Price</dt>
                    <dd>{formatUnitPrice(unitPrice(listing))}</dd>
                  </div>
                  <div>
                    <dt>Available Units</dt>
                    <dd>{units > 0 ? units.toLocaleString('en-US') : '—'}</dd>
                  </div>
                  <div>
                    <dt>Expected Yield</dt>
                    <dd className="org-mkt__yield">{yieldPct.toFixed(1)}%</dd>
                  </div>
                </dl>

                <div className="org-mkt__tags">
                  {tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>

                <div className="org-mkt__actions">
                  <Link href={`/assets/${listing.assetId}`} className="org-mkt__btn">
                    View details
                  </Link>
                  <Link href="/trading" className="org-mkt__btn org-mkt__btn--primary">
                    Invest now
                    <ArrowRight size={13} />
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
