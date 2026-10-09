'use client';

import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import {
  assetClassLabel,
  assetStatusLabel,
  formatDate,
  money,
  riskTone,
} from '@/lib/format';
import type { HydratedAsset } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import type { AssetClass, AssetStatus } from '@caprov/types';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownUp,
  Building2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileWarning,
  LayoutGrid,
  List,
  MoreVertical,
  Plus,
  Search,
  Sparkles,
  Upload,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';

const PAGE_SIZE = 6;

const CLASS_OPTIONS = Object.entries(assetClassLabel) as Array<[AssetClass, string]>;
const STATUS_OPTIONS = Object.entries(assetStatusLabel) as Array<[AssetStatus, string]>;
const RISK_OPTIONS = ['LOW', 'MODERATE', 'ELEVATED', 'HIGH'] as const;

type SortKey = 'updated' | 'name' | 'value' | 'risk';
type ViewMode = 'list' | 'grid';

function statusTone(status: AssetStatus) {
  if (status === 'ACTIVE') return 'ok';
  if (status === 'UNDER_REVIEW') return 'warn';
  if (status === 'ARCHIVED') return 'muted';
  return 'muted';
}

export default function AssetsPage() {
  const roles = useAuthStore((state) => state.roles);
  const bankerOnly =
    roles.includes('BANKER') &&
    !roles.some((role) => ['ORG_ADMIN', 'ANALYST', 'PLATFORM_ADMIN', 'BUYER'].includes(role));
  const canCreateAssets = roles.includes('ORG_ADMIN') || roles.includes('PLATFORM_ADMIN');

  const [query, setQuery] = useState('');
  const [assetClass, setAssetClass] = useState<AssetClass | 'ALL'>('ALL');
  const [status, setStatus] = useState<AssetStatus | 'ALL'>('ALL');
  const [risk, setRisk] = useState<(typeof RISK_OPTIONS)[number] | 'ALL'>('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('updated');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [view, setView] = useState<ViewMode>('list');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);

  const assetsQuery = useQuery({
    queryKey: ['assets'],
    queryFn: async () => (await api.get<HydratedAsset[]>('/assets')).data,
  });

  const allAssets = assetsQuery.data ?? [];
  const dnaReady = allAssets.filter((asset) => asset.latestDna).length;
  const needsDocuments = allAssets.filter((asset) => asset.documentCount === 0).length;
  const underReview = allAssets.filter((asset) => asset.status === 'UNDER_REVIEW').length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = allAssets.filter((asset) => {
      if (assetClass !== 'ALL' && asset.assetClass !== assetClass) return false;
      if (status !== 'ALL' && asset.status !== status) return false;
      if (risk !== 'ALL' && (asset.latestRisk?.payload.rating ?? '') !== risk) return false;
      if (!q) return true;
      return [asset.name, asset.location, asset.jurisdiction, assetClassLabel[asset.assetClass]]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });

    const riskRank: Record<string, number> = { LOW: 1, MODERATE: 2, ELEVATED: 3, HIGH: 4 };
    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortKey === 'value') {
        cmp =
          (a.latestValuation?.payload.amount ?? 0) - (b.latestValuation?.payload.amount ?? 0);
      } else if (sortKey === 'risk') {
        cmp =
          (riskRank[a.latestRisk?.payload.rating ?? ''] ?? 0) -
          (riskRank[b.latestRisk?.payload.rating ?? ''] ?? 0);
      } else {
        cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [allAssets, assetClass, status, risk, query, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const showingFrom = filtered.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const showingTo = Math.min(currentPage * PAGE_SIZE, filtered.length);
  const pageSelected = pageItems.every((asset) => selected.includes(asset.id)) && pageItems.length > 0;

  function toggleSort() {
    if (sortKey !== 'updated') {
      setSortKey('updated');
      setSortDir('desc');
      return;
    }
    setSortDir((dir) => (dir === 'desc' ? 'asc' : 'desc'));
  }

  function toggleAllOnPage() {
    if (pageSelected) {
      setSelected((ids) => ids.filter((id) => !pageItems.some((asset) => asset.id === id)));
      return;
    }
    setSelected((ids) => [...new Set([...ids, ...pageItems.map((asset) => asset.id)])]);
  }

  function toggleOne(id: string) {
    setSelected((ids) => (ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]));
  }

  function resetFilters() {
    setQuery('');
    setAssetClass('ALL');
    setStatus('ALL');
    setRisk('ALL');
    setPage(1);
  }

  const paginationNumbers = useMemo(() => {
    const maxButtons = 9;
    if (pageCount <= maxButtons) {
      return Array.from({ length: pageCount }, (_, index) => index + 1);
    }
    const windowStart = Math.max(1, Math.min(currentPage - 4, pageCount - maxButtons + 1));
    return Array.from({ length: maxButtons }, (_, index) => windowStart + index);
  }, [pageCount, currentPage]);

  const pagination = (
    <footer className="assets-mgmt__footer">
      <p>
        Showing {showingFrom} to {showingTo} of {filtered.length} assets
        {selected.length ? ` · ${selected.length} selected` : ''}
      </p>
      <div className="assets-mgmt__pager">
        <button
          type="button"
          aria-label="Previous page"
          disabled={currentPage <= 1}
          onClick={() => setPage((value) => Math.max(1, value - 1))}
        >
          <ChevronLeft size={15} />
        </button>
        {paginationNumbers.map((number) => (
          <button
            key={number}
            type="button"
            className={cn(number === currentPage && 'is-active')}
            onClick={() => setPage(number)}
          >
            {number}
          </button>
        ))}
        <button
          type="button"
          aria-label="Next page"
          disabled={currentPage >= pageCount}
          onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </footer>
  );

  return (
    <div className="assets-mgmt assets-mgmt--fit mx-auto w-full max-w-[92rem]">
      <section className="assets-mgmt__hero">
        <div className="assets-mgmt__hero-copy-block">
          <p className="assets-mgmt__eyebrow">Asset management</p>
          <h1 className="assets-mgmt__title">
            {bankerOnly ? 'Collateral-backed assets' : 'Assets'}
          </h1>
          <p className="assets-mgmt__hero-copy">
            {bankerOnly
              ? 'Review only the asset records submitted as live collateral. Asset creation and intelligence remain with the lister.'
              : 'Create and review the assets your team manages. Each asset becomes the home for documents, Asset DNA, collateral, and lending.'}
          </p>
        </div>
        <div className="assets-mgmt__hero-actions">
          {canCreateAssets ? (
            <Link href="/assets/new" className="assets-mgmt__btn assets-mgmt__btn--primary">
              <Plus size={15} />
              New asset
            </Link>
          ) : null}
          {!bankerOnly ? (
            <Link href="/documents" className="assets-mgmt__btn">
              <Upload size={15} />
              Add documents
            </Link>
          ) : null}
        </div>
      </section>

      <section className="assets-mgmt__stats">
        {[
          {
            label: 'Assets',
            value: String(allAssets.length),
            hint: 'Total assets in workspace',
            icon: Building2,
            tone: 'gold',
          },
          {
            label: 'DNA ready',
            value: String(dnaReady),
            hint: 'Assets with at least one complete DNA',
            icon: Sparkles,
            tone: 'teal',
          },
          {
            label: 'Need documents',
            value: String(needsDocuments),
            hint: 'Assets missing required files',
            icon: FileWarning,
            tone: 'warn',
          },
          {
            label: 'Under review',
            value: String(underReview),
            hint: 'Assets awaiting internal review',
            icon: Clock3,
            tone: 'ink',
          },
        ].map((stat) => (
          <article key={stat.label} className="assets-mgmt__stat">
            <span className={cn('assets-mgmt__stat-icon', `assets-mgmt__stat-icon--${stat.tone}`)}>
              <stat.icon size={15} />
            </span>
            <div className="min-w-0">
              <p className="assets-mgmt__stat-label">{stat.label}</p>
              <p className="assets-mgmt__stat-value">{stat.value}</p>
              <p className="assets-mgmt__stat-hint">{stat.hint}</p>
            </div>
          </article>
        ))}
      </section>

      {allAssets.length === 0 ? (
        <section className="assets-mgmt__panel p-8">
          <h2 className="font-display text-xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
            {bankerOnly
              ? 'No collateral-backed assets are available'
              : canCreateAssets
                ? 'Start with the first asset record'
                : 'No assets are available yet'}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            {bankerOnly
              ? 'Assets appear here once a lister submits a live collateral position for bank review.'
              : canCreateAssets
                ? 'Assets are the anchor for the rest of the platform. Once you create one, your team can add documents, review Asset DNA, and move into portfolio, tokenization, collateral, and lending workflows.'
                : 'Assets created by your workspace will appear here. You can review them and ask AI for analysis.'}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            {canCreateAssets ? (
              <Link href="/assets/new" className="assets-mgmt__btn assets-mgmt__btn--primary">
                Create asset
              </Link>
            ) : null}
            {!bankerOnly ? (
              <Link href="/documents" className="assets-mgmt__btn">
                See document workflow
              </Link>
            ) : (
              <Link href="/collateral" className="assets-mgmt__btn">
                Open collateral review
              </Link>
            )}
          </div>
        </section>
      ) : (
        <>
          <section className="assets-mgmt__toolbar">
            <label className="assets-mgmt__search">
              <Search size={15} aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                placeholder="Search by name, location, or asset class…"
              />
            </label>

            <select
              className="assets-mgmt__select"
              value={assetClass}
              onChange={(event) => {
                setAssetClass(event.target.value as AssetClass | 'ALL');
                setPage(1);
              }}
              aria-label="Asset class"
            >
              <option value="ALL">Asset class</option>
              {CLASS_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>

            <select
              className="assets-mgmt__select"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as AssetStatus | 'ALL');
                setPage(1);
              }}
              aria-label="Status"
            >
              <option value="ALL">Status</option>
              {STATUS_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>

            <select
              className="assets-mgmt__select"
              value={risk}
              onChange={(event) => {
                setRisk(event.target.value as (typeof RISK_OPTIONS)[number] | 'ALL');
                setPage(1);
              }}
              aria-label="Risk"
            >
              <option value="ALL">Risk</option>
              {RISK_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>

            <button type="button" className="assets-mgmt__sort" onClick={toggleSort}>
              <ArrowDownUp size={14} />
              Sort: {sortKey === 'updated' ? 'Updated' : sortKey === 'name' ? 'Name' : sortKey === 'value' ? 'Value' : 'Risk'}
            </button>

            {(query || assetClass !== 'ALL' || status !== 'ALL' || risk !== 'ALL') && (
              <button type="button" className="assets-mgmt__clear" onClick={resetFilters}>
                Clear
              </button>
            )}

            <div className="assets-mgmt__views" role="group" aria-label="View mode">
              <button
                type="button"
                className={cn(view === 'list' && 'is-active')}
                aria-pressed={view === 'list'}
                aria-label="List view"
                onClick={() => setView('list')}
              >
                <List size={15} />
              </button>
              <button
                type="button"
                className={cn(view === 'grid' && 'is-active')}
                aria-pressed={view === 'grid'}
                aria-label="Grid view"
                onClick={() => setView('grid')}
              >
                <LayoutGrid size={15} />
              </button>
            </div>
          </section>

          <div className="assets-mgmt__workspace">
            {view === 'list' ? (
              <section className="assets-mgmt__panel assets-mgmt__table-shell">
                <div className="assets-mgmt__table-scroll">
                  <table className="assets-mgmt__table w-full min-w-[960px] text-left text-sm">
                    <thead>
                      <tr>
                        <th className="w-12">
                          <input
                            type="checkbox"
                            checked={pageSelected}
                            onChange={toggleAllOnPage}
                            aria-label="Select all on page"
                          />
                        </th>
                        <th>Asset</th>
                        <th>Asset class</th>
                        <th>Status</th>
                        <th>Current value</th>
                        <th>Asset DNA</th>
                        <th>Risk</th>
                        <th>Updated</th>
                        <th aria-label="Actions" />
                      </tr>
                    </thead>
                    <tbody>
                      {pageItems.length ? (
                        pageItems.map((asset) => (
                          <tr key={asset.id}>
                            <td>
                              <input
                                type="checkbox"
                                checked={selected.includes(asset.id)}
                                onChange={() => toggleOne(asset.id)}
                                aria-label={`Select ${asset.name}`}
                              />
                            </td>
                            <td>
                              <Link href={`/assets/${asset.id}`} className="assets-mgmt__asset">
                                <span className="assets-mgmt__thumb">
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
                                    <Building2 size={14} />
                                  )}
                                </span>
                                <span className="min-w-0">
                                  <span className="assets-mgmt__asset-name">{asset.name}</span>
                                  <span className="assets-mgmt__asset-meta">
                                    {asset.location ?? asset.jurisdiction ?? '—'}
                                  </span>
                                </span>
                              </Link>
                            </td>
                            <td className="text-[var(--muted)]">{assetClassLabel[asset.assetClass]}</td>
                            <td>
                              <span
                                className={cn(
                                  'assets-mgmt__status',
                                  `assets-mgmt__status--${statusTone(asset.status)}`,
                                )}
                              >
                                <span />
                                {asset.status.replaceAll('_', ' ')}
                              </span>
                            </td>
                            <td className="font-semibold tabular-nums text-[var(--ink)]">
                              {money(
                                asset.latestValuation?.payload.amount,
                                asset.latestValuation?.payload.currency ?? asset.currency,
                              )}
                            </td>
                            <td className="tabular-nums text-[var(--muted)]">
                              {asset.latestDna ? `v${asset.latestDna.version}` : '—'}
                            </td>
                            <td>
                              <Badge tone={riskTone(asset.latestRisk?.payload.rating)}>
                                {asset.latestRisk?.payload.rating ?? 'n/a'}
                              </Badge>
                            </td>
                            <td className="text-[var(--muted)]">{formatDate(asset.updatedAt)}</td>
                            <td>
                              <Link
                                href={`/assets/${asset.id}`}
                                className="assets-mgmt__more"
                                aria-label={`Open ${asset.name}`}
                              >
                                <MoreVertical size={15} />
                              </Link>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={9} className="px-6 py-10 text-center text-sm text-[var(--muted)]">
                            No assets match these filters. Try another term or clear the filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {pagination}
              </section>
            ) : (
              <section className="assets-mgmt__panel assets-mgmt__grid-shell">
                <div className="assets-mgmt__grid-scroll grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {pageItems.map((asset) => (
                    <Link key={asset.id} href={`/assets/${asset.id}`} className="assets-mgmt__card">
                      <div className="assets-mgmt__card-media">
                        {asset.primaryImageUrl ? (
                          <Image
                            src={asset.primaryImageUrl}
                            alt=""
                            fill
                            unoptimized
                            className="object-cover"
                            sizes="(max-width: 1280px) 50vw, 30vw"
                          />
                        ) : (
                          <span className="grid h-full place-items-center text-[var(--gold)]">
                            <Building2 size={24} />
                          </span>
                        )}
                      </div>
                      <div className="p-3.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-[var(--ink)]">{asset.name}</p>
                            <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                              {asset.location ?? asset.jurisdiction ?? '—'}
                            </p>
                          </div>
                          <Badge tone={riskTone(asset.latestRisk?.payload.rating)}>
                            {asset.latestRisk?.payload.rating ?? 'n/a'}
                          </Badge>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                          <span className="text-[var(--muted)]">{assetClassLabel[asset.assetClass]}</span>
                          <span className="font-semibold tabular-nums">
                            {money(
                              asset.latestValuation?.payload.amount,
                              asset.latestValuation?.payload.currency ?? asset.currency,
                            )}
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                  {!pageItems.length ? (
                    <div className="col-span-full px-6 py-10 text-center text-sm text-[var(--muted)]">
                      No assets match these filters.
                    </div>
                  ) : null}
                </div>
                {pagination}
              </section>
            )}
          </div>
        </>
      )}
    </div>
  );
}
