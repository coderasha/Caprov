'use client';

import { api } from '@/lib/api';
import { assetClassLabel, formatDate, money, moneyCompact } from '@/lib/format';
import type { DocumentRow, HydratedAsset } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import {
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Filter,
  Hourglass,
  Lock,
  Search,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

type CollateralStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'REJECTED' | string;

type ReviewTab = 'all' | 'pending' | 'approved' | 'rejected';
type DetailTab = 'overview' | 'documents' | 'valuation' | 'onchain' | 'timeline';
type SortKey = 'newest' | 'oldest' | 'value-desc' | 'value-asc' | 'name';

type CollateralRow = {
  id: string;
  assetId: string;
  status: CollateralStatus;
  pledgedValue: number;
  advanceableValue: number;
  utilizedAmount?: number;
  availableAmount?: number;
  currency: string;
  haircutBps: number;
  collateralBps?: number;
  lockedTokenUnits?: number;
  vaultTxHash?: string;
  vaultCollateralId?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
  organization?: { id: string; name: string } | null;
  asset?: {
    id: string;
    name: string;
    assetClass?: keyof typeof assetClassLabel;
    location?: string;
    jurisdiction?: string;
    description?: string;
    primaryImageUrl?: string;
    imageUrls?: string[];
  } | null;
  token?: {
    id: string;
    tokenId?: string;
    mode?: string;
    supply?: number;
    contractAddress?: string;
    status?: string;
  } | null;
  marketValuation?: {
    pricePerTokenUsd: number;
    assetValueUsd: number;
    sourceLabel: string;
    settledTradeCount: number;
    observedAt: string;
  } | null;
  valuation?: {
    payload: { amount: number; currency: string; method?: string; asOf?: string };
  } | null;
};

function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string | string[] } | undefined;
    if (Array.isArray(data?.message)) return data.message.join(', ');
    if (typeof data?.message === 'string') return data.message;
    return error.message;
  }
  return error instanceof Error ? error.message : 'Request failed';
}

function valuationAmount(item: CollateralRow, asset?: HydratedAsset | null) {
  return (
    item.marketValuation?.assetValueUsd ??
    item.valuation?.payload.amount ??
    asset?.latestValuation?.payload.amount ??
    item.pledgedValue ??
    0
  );
}

function ltvPercent(item: CollateralRow, assetValue: number) {
  if (item.haircutBps > 0) {
    return Math.max(0, Math.round((10_000 - item.haircutBps) / 100));
  }
  const base =
    item.pledgedValue > 0 ? item.pledgedValue : assetValue > 0 ? assetValue : 0;
  if (base > 0 && item.advanceableValue > 0) {
    return Math.min(100, Math.round((item.advanceableValue / base) * 100));
  }
  return 65;
}

function statusMeta(
  status: CollateralStatus,
  opts?: { inReview?: boolean },
): { label: string; tone: 'pending' | 'review' | 'approved' | 'rejected' } {
  if (status === 'ACTIVE') return { label: 'Approved', tone: 'approved' };
  if (status === 'REJECTED') return { label: 'Rejected', tone: 'rejected' };
  if (opts?.inReview) return { label: 'In Review', tone: 'review' };
  return { label: 'Pending Review', tone: 'pending' };
}

function matchesTab(status: CollateralStatus, tab: ReviewTab) {
  if (tab === 'all') return true;
  if (tab === 'pending') return status === 'PENDING_APPROVAL';
  if (tab === 'approved') return status === 'ACTIVE';
  return status === 'REJECTED';
}

function explorerTxUrl(hash?: string) {
  if (!hash) return null;
  return `https://sepolia.etherscan.io/tx/${hash}`;
}

function shortTokenLabel(tokenId?: string | null, fallbackId?: string | null) {
  const raw = tokenId?.trim() || fallbackId?.trim() || '';
  if (!raw) return '—';
  if (/^\d+$/.test(raw) && raw.length > 10) {
    return `ERC-1155 #${raw.slice(0, 6)}…${raw.slice(-4)}`;
  }
  if (raw.length > 18) return `${raw.slice(0, 10)}…${raw.slice(-4)}`;
  return tokenId ? `ERC-1155 #${raw}` : raw;
}

export function BankerCollateralReview({
  initialCollateralId = '',
  initialAssetId = '',
}: {
  initialCollateralId?: string;
  initialAssetId?: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<ReviewTab>('all');
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('newest');
  const [selectedId, setSelectedId] = useState(initialCollateralId);
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const [imageIndex, setImageIndex] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [classFilter, setClassFilter] = useState<string>('ALL');
  const [actionError, setActionError] = useState<string | null>(null);

  const collateralQuery = useQuery({
    queryKey: ['collateral', 'banker-review'],
    queryFn: async () => (await api.get<CollateralRow[]>('/collateral')).data,
  });
  const assetsQuery = useQuery({
    queryKey: ['assets', 'banker-review'],
    queryFn: async () => (await api.get<HydratedAsset[]>('/assets')).data,
  });

  const rows = collateralQuery.data ?? [];
  const assetsById = useMemo(() => {
    const map = new Map<string, HydratedAsset>();
    for (const asset of assetsQuery.data ?? []) map.set(asset.id, asset);
    return map;
  }, [assetsQuery.data]);

  useEffect(() => {
    if (selectedId) return;
    if (initialCollateralId) {
      setSelectedId(initialCollateralId);
      return;
    }
    if (!initialAssetId) return;
    const match = rows.find((item) => item.assetId === initialAssetId);
    if (match) setSelectedId(match.id);
  }, [initialAssetId, initialCollateralId, rows, selectedId]);

  const counts = useMemo(() => {
    const pending = rows.filter((item) => item.status === 'PENDING_APPROVAL').length;
    const approved = rows.filter((item) => item.status === 'ACTIVE').length;
    const rejected = rows.filter((item) => item.status === 'REJECTED').length;
    return {
      all: rows.length,
      pending,
      approved,
      rejected,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rows.filter((item) => {
      if (!matchesTab(item.status, tab)) return false;
      const asset = assetsById.get(item.assetId);
      const assetClass = item.asset?.assetClass ?? asset?.assetClass;
      if (classFilter !== 'ALL' && assetClass !== classFilter) return false;
      if (!q) return true;
      const haystack = [
        item.asset?.name,
        asset?.name,
        item.organization?.name,
        item.asset?.location,
        asset?.location,
        item.asset?.jurisdiction,
        assetClass ? assetClassLabel[assetClass] : '',
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });

    list = [...list].sort((a, b) => {
      const aAsset = assetsById.get(a.assetId);
      const bAsset = assetsById.get(b.assetId);
      const aValue = valuationAmount(a, aAsset);
      const bValue = valuationAmount(b, bAsset);
      if (sortKey === 'oldest') return a.createdAt.localeCompare(b.createdAt);
      if (sortKey === 'value-desc') return bValue - aValue;
      if (sortKey === 'value-asc') return aValue - bValue;
      if (sortKey === 'name') {
        return (a.asset?.name ?? aAsset?.name ?? '').localeCompare(
          b.asset?.name ?? bAsset?.name ?? '',
        );
      }
      return b.createdAt.localeCompare(a.createdAt);
    });
    return list;
  }, [assetsById, classFilter, query, rows, sortKey, tab]);

  const selected = rows.find((item) => item.id === selectedId) ?? null;
  const selectedAsset = selected ? assetsById.get(selected.assetId) ?? null : null;

  const documentsQuery = useQuery({
    queryKey: ['documents', 'banker-review', selected?.assetId],
    enabled: Boolean(selected?.assetId) && detailTab === 'documents',
    queryFn: async () =>
      (
        await api.get<DocumentRow[]>(
          `/documents?assetId=${encodeURIComponent(selected!.assetId)}&currentOnly=true`,
        )
      ).data,
  });

  const gallery = useMemo(() => {
    if (!selected) return [] as string[];
    const urls = [
      selected.asset?.primaryImageUrl,
      ...(selected.asset?.imageUrls ?? []),
      selectedAsset?.primaryImageUrl,
      ...(selectedAsset?.imageUrls ?? []),
    ].filter((url): url is string => Boolean(url));
    return [...new Set(urls)];
  }, [selected, selectedAsset]);

  useEffect(() => {
    setImageIndex(0);
    setDetailTab('overview');
    setActionError(null);
  }, [selectedId]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['collateral'] });
    await queryClient.invalidateQueries({ queryKey: ['lending'] });
  };

  const approve = useMutation({
    mutationFn: async (id: string) => api.post(`/collateral/${id}/approve`),
    onSuccess: async () => {
      setActionError(null);
      await refresh();
    },
    onError: (error) => setActionError(errorMessage(error)),
  });

  const reject = useMutation({
    mutationFn: async (id: string) => api.post(`/collateral/${id}/reject`),
    onSuccess: async () => {
      setActionError(null);
      await refresh();
    },
    onError: (error) => setActionError(errorMessage(error)),
  });

  function openReview(id: string) {
    setSelectedId(id);
    router.replace(`/collateral?id=${encodeURIComponent(id)}`, { scroll: false });
  }

  function closePanel() {
    setSelectedId('');
    router.replace('/collateral', { scroll: false });
  }

  const classOptions = useMemo(() => {
    const set = new Set<string>();
    for (const item of rows) {
      const cls = item.asset?.assetClass ?? assetsById.get(item.assetId)?.assetClass;
      if (cls) set.add(cls);
    }
    return [...set];
  }, [assetsById, rows]);

  const selectedValue = selected ? valuationAmount(selected, selectedAsset) : 0;
  const selectedLtv = selected ? ltvPercent(selected, selectedValue) : 0;
  const selectedLoanRequest = selected
    ? selected.advanceableValue || selected.pledgedValue * (1 - selected.haircutBps / 10_000)
    : 0;
  const selectedStatus = selected
    ? statusMeta(selected.status, { inReview: selected.status === 'PENDING_APPROVAL' })
    : null;
  const txUrl = explorerTxUrl(selected?.vaultTxHash);

  const stats = [
    {
      label: 'Total Collateral',
      value: String(counts.all),
      hint: 'Awaiting review',
      icon: FileText,
      tone: 'neutral' as const,
    },
    {
      label: 'Pending Approval',
      value: String(counts.pending),
      hint: 'Requires action',
      icon: Hourglass,
      tone: 'pending' as const,
    },
    {
      label: 'Approved',
      value: String(counts.approved),
      hint: 'This month',
      icon: CheckCircle2,
      tone: 'approved' as const,
    },
    {
      label: 'Rejected',
      value: String(counts.rejected),
      hint: 'This month',
      icon: XCircle,
      tone: 'rejected' as const,
    },
  ];

  const detailTabs: Array<{ key: DetailTab; label: string }> = [
    { key: 'overview', label: 'Overview' },
    { key: 'documents', label: 'Documents' },
    { key: 'valuation', label: 'Valuation' },
    { key: 'onchain', label: 'On-chain Data' },
    { key: 'timeline', label: 'Timeline' },
  ];

  return (
    <div className={cn('banker-col', selected && 'banker-col--split')}>
      <section className="banker-col__hero">
        <div className="banker-col__hero-copy">
          <p className="banker-col__eyebrow">Collateral review</p>
          <h1 className="banker-col__title">Review pledged collateral</h1>
          <p className="banker-col__lead">
            Validate asset details, documents and valuation before approving bank financing.
          </p>
        </div>
        <div className="banker-col__hero-media" aria-hidden="true">
          <Image
            src="/banker-dashboard-hero.jpg"
            alt=""
            fill
            priority
            sizes="(max-width: 1100px) 100vw, 38vw"
            className="object-cover object-center"
            unoptimized
          />
          <div className="banker-col__hero-quote">
            <p>Verified assets. Stronger lending decisions.</p>
          </div>
        </div>
      </section>

      <section className="banker-col__stats" aria-label="Collateral review summary">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <article key={stat.label} className={cn('banker-col__stat', `banker-col__stat--${stat.tone}`)}>
              <div className="banker-col__stat-top">
                <p className="banker-col__stat-label">{stat.label}</p>
                <span className="banker-col__stat-icon" aria-hidden="true">
                  <Icon size={18} strokeWidth={1.75} />
                </span>
              </div>
              <p className="banker-col__stat-value">{stat.value}</p>
              <p className="banker-col__stat-hint">{stat.hint}</p>
            </article>
          );
        })}
      </section>

      <div className="banker-col__workspace">
        <section className="banker-col__list-panel">
          <div className="banker-col__tabs" role="tablist" aria-label="Collateral status">
            {(
              [
                ['all', `All (${counts.all})`],
                ['pending', `Pending (${counts.pending})`],
                ['approved', `Approved (${counts.approved})`],
                ['rejected', `Rejected (${counts.rejected})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                className={cn('banker-col__tab', tab === key && 'is-active')}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="banker-col__toolbar">
            <label className="banker-col__search">
              <Search size={15} aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by asset name..."
              />
            </label>
            <div className="banker-col__toolbar-actions">
              <button
                type="button"
                className={cn('banker-col__tool-btn', filtersOpen && 'is-active')}
                onClick={() => setFiltersOpen((open) => !open)}
              >
                <Filter size={14} />
                Filters
              </button>
              <label className="banker-col__sort">
                <span>Sort by</span>
                <select
                  value={sortKey}
                  onChange={(event) => setSortKey(event.target.value as SortKey)}
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="value-desc">Highest value</option>
                  <option value="value-asc">Lowest value</option>
                  <option value="name">Asset name</option>
                </select>
              </label>
            </div>
          </div>

          {filtersOpen ? (
            <div className="banker-col__filters">
              <label>
                Asset class
                <select value={classFilter} onChange={(event) => setClassFilter(event.target.value)}>
                  <option value="ALL">All classes</option>
                  {classOptions.map((cls) => (
                    <option key={cls} value={cls}>
                      {assetClassLabel[cls as keyof typeof assetClassLabel] ?? cls}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          <div className="banker-col__rows">
            {collateralQuery.isLoading ? (
              <p className="banker-col__empty">Loading collateral queue…</p>
            ) : null}
            {collateralQuery.isError ? (
              <p className="banker-col__empty banker-col__empty--error">
                {errorMessage(collateralQuery.error)}
              </p>
            ) : null}
            {!collateralQuery.isLoading && !filtered.length ? (
              <p className="banker-col__empty">No collateral matches this view.</p>
            ) : null}
            {filtered.map((item) => {
              const asset = assetsById.get(item.assetId);
              const name = item.asset?.name ?? asset?.name ?? item.id;
              const borrower = item.organization?.name ?? 'Borrower organization';
              const location =
                item.asset?.location ||
                asset?.location ||
                item.asset?.jurisdiction ||
                asset?.jurisdiction ||
                '—';
              const assetClass = item.asset?.assetClass ?? asset?.assetClass;
              const value = valuationAmount(item, asset);
              const ltv = ltvPercent(item, value);
              const units = item.lockedTokenUnits ?? item.token?.supply;
              const image =
                item.asset?.primaryImageUrl ||
                item.asset?.imageUrls?.[0] ||
                asset?.primaryImageUrl ||
                asset?.imageUrls?.[0];
              const inReview = selectedId === item.id && item.status === 'PENDING_APPROVAL';
              const status = statusMeta(item.status, { inReview });
              const selectedRow = selectedId === item.id;

              return (
                <article
                  key={item.id}
                  className={cn('banker-col__row', selectedRow && 'is-selected')}
                >
                  <button
                    type="button"
                    className="banker-col__row-main"
                    onClick={() => openReview(item.id)}
                  >
                    <span className="banker-col__thumb">
                      {image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={image} alt="" />
                      ) : (
                        <Building2 size={18} />
                      )}
                    </span>
                    <span className="banker-col__row-copy">
                      <strong>{name}</strong>
                      <em>{borrower}</em>
                      <span className="banker-col__chips">
                        <span>{assetClass ? assetClassLabel[assetClass] : 'Asset'}</span>
                        <span>{location}</span>
                      </span>
                    </span>
                    <span className="banker-col__row-metrics">
                      <span>
                        <small>Valuation</small>
                        <b>{moneyCompact(value)}</b>
                      </span>
                      <span>
                        <small>LTV</small>
                        <b>{ltv}%</b>
                      </span>
                      <span>
                        <small>Units</small>
                        <b>
                          {units != null
                            ? `${units.toLocaleString()} ERC-1155`
                            : '—'}
                        </b>
                      </span>
                    </span>
                    <span className="banker-col__row-status">
                      <span className={cn('banker-col__pill', `banker-col__pill--${status.tone}`)}>
                        {status.label}
                      </span>
                      <small>{formatDate(item.updatedAt || item.createdAt)}</small>
                    </span>
                  </button>
                  <button
                    type="button"
                    className={cn(
                      'banker-col__row-action',
                      item.status === 'PENDING_APPROVAL'
                        ? 'banker-col__row-action--primary'
                        : 'banker-col__row-action--ghost',
                    )}
                    onClick={() => openReview(item.id)}
                  >
                    {item.status === 'PENDING_APPROVAL' ? 'Review' : 'View'}
                    <ArrowRight size={14} />
                  </button>
                </article>
              );
            })}
          </div>
        </section>

        {selected && selectedStatus ? (
          <aside className="banker-col__detail" aria-label="Collateral detail">
            <header className="banker-col__detail-head">
              <div>
                <h2>{selected.asset?.name ?? selectedAsset?.name ?? selected.id}</h2>
                <span
                  className={cn(
                    'banker-col__pill',
                    `banker-col__pill--${selectedStatus.tone}`,
                  )}
                >
                  {selectedStatus.label}
                </span>
              </div>
              <button type="button" className="banker-col__icon-btn" onClick={closePanel} aria-label="Close detail">
                <X size={16} />
              </button>
            </header>

            <div className="banker-col__detail-meta">
              <span>
                {selected.asset?.assetClass || selectedAsset?.assetClass
                  ? assetClassLabel[
                      (selected.asset?.assetClass ||
                        selectedAsset?.assetClass) as keyof typeof assetClassLabel
                    ]
                  : 'Asset'}
              </span>
              <span>
                {selected.asset?.location ||
                  selectedAsset?.location ||
                  selected.asset?.jurisdiction ||
                  selectedAsset?.jurisdiction ||
                  '—'}
              </span>
              <span>Token ID: {shortTokenLabel(selected.token?.tokenId, selected.token?.id)}</span>
            </div>

            <div className="banker-col__gallery">
              {gallery.length ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={gallery[imageIndex % gallery.length]} alt="" />
                  {gallery.length > 1 ? (
                    <>
                      <button
                        type="button"
                        className="banker-col__gallery-nav banker-col__gallery-nav--prev"
                        onClick={() =>
                          setImageIndex((index) => (index - 1 + gallery.length) % gallery.length)
                        }
                        aria-label="Previous image"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <button
                        type="button"
                        className="banker-col__gallery-nav banker-col__gallery-nav--next"
                        onClick={() => setImageIndex((index) => (index + 1) % gallery.length)}
                        aria-label="Next image"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </>
                  ) : null}
                  <span className="banker-col__gallery-count">
                    {(imageIndex % gallery.length) + 1}/{gallery.length}
                  </span>
                </>
              ) : (
                <div className="banker-col__gallery-empty">
                  <Building2 size={28} />
                  <p>No asset imagery available</p>
                </div>
              )}
            </div>

            <div className="banker-col__detail-tabs" role="tablist">
              {detailTabs.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={detailTab === item.key}
                  className={cn('banker-col__detail-tab', detailTab === item.key && 'is-active')}
                  onClick={() => setDetailTab(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="banker-col__detail-body">
              {detailTab === 'overview' ? (
                <>
                  <div className="banker-col__grid">
                    <div>
                      <small>Borrower</small>
                      <p>{selected.organization?.name ?? '—'}</p>
                    </div>
                    <div>
                      <small>Asset class</small>
                      <p>
                        {selected.asset?.assetClass || selectedAsset?.assetClass
                          ? assetClassLabel[
                              (selected.asset?.assetClass ||
                                selectedAsset?.assetClass) as keyof typeof assetClassLabel
                            ]
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <small>Location</small>
                      <p>
                        {selected.asset?.location ||
                          selectedAsset?.location ||
                          selected.asset?.jurisdiction ||
                          selectedAsset?.jurisdiction ||
                          '—'}
                      </p>
                    </div>
                    <div>
                      <small>Valuation</small>
                      <p>{money(selectedValue, selected.currency || 'USD')}</p>
                    </div>
                    <div>
                      <small>Loan request</small>
                      <p>{money(selectedLoanRequest, selected.currency || 'USD')}</p>
                    </div>
                    <div>
                      <small>LTV</small>
                      <p>{selectedLtv}%</p>
                    </div>
                    <div>
                      <small>Tokenized units</small>
                      <p>
                        {(selected.lockedTokenUnits ?? selected.token?.supply ?? 0).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <small>Token ID</small>
                      <p>{shortTokenLabel(selected.token?.tokenId, selected.token?.id)}</p>
                    </div>
                    <div>
                      <small>Lock status</small>
                      <p className="banker-col__lock">
                        <Lock size={13} />
                        {selected.status === 'REJECTED' ? 'Released' : 'Locked'}
                      </p>
                    </div>
                  </div>
                  <div className="banker-col__description">
                    <h3>Asset description</h3>
                    <p>
                      {selected.asset?.description ||
                        selectedAsset?.description ||
                        selectedAsset?.latestDna?.envelope.summary ||
                        'No description has been provided for this pledged asset yet.'}
                    </p>
                  </div>
                </>
              ) : null}

              {detailTab === 'documents' ? (
                <div className="banker-col__docs">
                  {documentsQuery.isLoading ? <p>Loading documents…</p> : null}
                  {!documentsQuery.isLoading && !(documentsQuery.data ?? []).length ? (
                    <p>No current documents are linked to this asset.</p>
                  ) : null}
                  <ul>
                    {(documentsQuery.data ?? []).map((doc) => (
                      <li key={doc.id}>
                        <FileText size={15} />
                        <div>
                          <strong>{doc.name}</strong>
                          <span>
                            {doc.type.replaceAll('_', ' ')} · {formatDate(doc.createdAt)}
                          </span>
                        </div>
                        <Link href={`/documents/${doc.id}`}>Open</Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {detailTab === 'valuation' ? (
                <div className="banker-col__valuation">
                  <div className="banker-col__grid">
                    <div>
                      <small>Reference value</small>
                      <p>{money(selectedValue, 'USD')}</p>
                    </div>
                    <div>
                      <small>Pledged value</small>
                      <p>{money(selected.pledgedValue, selected.currency)}</p>
                    </div>
                    <div>
                      <small>Advanceable</small>
                      <p>{money(selected.advanceableValue, selected.currency)}</p>
                    </div>
                    <div>
                      <small>Haircut</small>
                      <p>{(selected.haircutBps / 100).toFixed(2)}%</p>
                    </div>
                  </div>
                  {selected.marketValuation ? (
                    <p className="banker-col__note">
                      {money(selected.marketValuation.pricePerTokenUsd, 'USD')} per unit ·{' '}
                      {selected.marketValuation.sourceLabel} · observed{' '}
                      {formatDate(selected.marketValuation.observedAt)}
                    </p>
                  ) : null}
                  <Link
                    href={`/intelligence/dna/${selected.assetId}`}
                    className="banker-col__inline-link"
                  >
                    Open full DNA valuation
                    <ArrowRight size={13} />
                  </Link>
                </div>
              ) : null}

              {detailTab === 'onchain' ? (
                <div className="banker-col__onchain">
                  <div className="banker-col__grid">
                    <div>
                      <small>Vault collateral ID</small>
                      <p>{selected.vaultCollateralId || '—'}</p>
                    </div>
                    <div>
                      <small>Contract</small>
                      <p>{selected.token?.contractAddress || '—'}</p>
                    </div>
                    <div>
                      <small>Mode</small>
                      <p>{selected.token?.mode || 'ERC-1155'}</p>
                    </div>
                    <div>
                      <small>Units locked</small>
                      <p>
                        {(selected.lockedTokenUnits ?? selected.token?.supply ?? 0).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  {txUrl ? (
                    <a
                      href={txUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="banker-col__inline-link"
                    >
                      View lock transaction
                      <ExternalLink size={13} />
                    </a>
                  ) : (
                    <p className="banker-col__note">No vault transaction hash is recorded yet.</p>
                  )}
                </div>
              ) : null}

              {detailTab === 'timeline' ? (
                <ol className="banker-col__timeline">
                  <li>
                    <strong>Collateral pledged</strong>
                    <span>{formatDate(selected.createdAt)}</span>
                  </li>
                  {selected.status === 'PENDING_APPROVAL' ? (
                    <li>
                      <strong>Awaiting bank decision</strong>
                      <span>{formatDate(selected.updatedAt)}</span>
                    </li>
                  ) : null}
                  {selected.approvedAt ? (
                    <li>
                      <strong>Approved for lending</strong>
                      <span>{formatDate(selected.approvedAt)}</span>
                    </li>
                  ) : null}
                  {selected.status === 'REJECTED' ? (
                    <li>
                      <strong>Rejected by credit desk</strong>
                      <span>{formatDate(selected.updatedAt)}</span>
                    </li>
                  ) : null}
                </ol>
              ) : null}
            </div>

            {actionError ? <p className="banker-col__action-error">{actionError}</p> : null}

            <div className="banker-col__secondary-actions">
              {txUrl ? (
                <a href={txUrl} target="_blank" rel="noreferrer" className="banker-col__secondary-btn">
                  <ExternalLink size={14} />
                  View on Blockchain
                </a>
              ) : (
                <button type="button" className="banker-col__secondary-btn" disabled>
                  <ExternalLink size={14} />
                  View on Blockchain
                </button>
              )}
              <Link
                href={`/intelligence/copilot?asset=${encodeURIComponent(selected.assetId)}&locked=1`}
                className="banker-col__secondary-btn"
              >
                <Sparkles size={14} />
                Ask AI
              </Link>
              <Link
                href={`/assets/${selected.assetId}?tab=documents`}
                className="banker-col__secondary-btn"
              >
                <Download size={14} />
                Download Report
              </Link>
            </div>

            {selected.status === 'PENDING_APPROVAL' ? (
              <div className="banker-col__primary-actions">
                <button
                  type="button"
                  className="banker-col__approve"
                  disabled={approve.isPending || reject.isPending}
                  onClick={() => approve.mutate(selected.id)}
                >
                  <Check size={16} />
                  {approve.isPending ? 'Approving…' : 'Approve Collateral'}
                </button>
                <button
                  type="button"
                  className="banker-col__reject"
                  disabled={approve.isPending || reject.isPending}
                  onClick={() => reject.mutate(selected.id)}
                >
                  <X size={16} />
                  {reject.isPending ? 'Rejecting…' : 'Reject Collateral'}
                </button>
              </div>
            ) : (
              <div className="banker-col__primary-actions">
                <Link href="/lending" className="banker-col__approve banker-col__approve--link">
                  Open loan desk
                  <ArrowRight size={15} />
                </Link>
              </div>
            )}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
