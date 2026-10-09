'use client';

import { MiniBars } from '@/components/dashboard/dashboard-charts';
import { LlmModelPicker } from '@/components/intelligence/llm-model-picker';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import {
  assetClassLabel,
  confidenceLabel,
  formatDateTime,
  moneyCompact,
  riskTone,
} from '@/lib/format';
import type { HydratedAsset, JobRow } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDownUp,
  Building2,
  ChevronLeft,
  ChevronRight,
  FileWarning,
  Filter,
  Layers,
  MoreVertical,
  Plus,
  Search,
  Sparkles,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';

const PAGE_SIZE = 6;

type ReviewFilter = 'ALL' | 'REVIEW' | 'READY';
type SortKey = 'updated' | 'name' | 'progress' | 'risk';

function dnaProgress(asset: HydratedAsset) {
  let score = 0;
  if (asset.latestDna) score += 45;
  if (asset.documentCount > 0) score += 20;
  if (asset.documentCount >= 3) score += 10;
  if (asset.latestValuation) score += 15;
  if (asset.latestRisk) score += 10;
  if (asset.latestDna?.envelope.confidence.overall) {
    score = Math.max(score, Math.round(asset.latestDna.envelope.confidence.overall * 100));
  }
  return Math.min(100, score);
}

function needsReview(asset: HydratedAsset) {
  return (
    !asset.latestDna ||
    asset.documentCount === 0 ||
    ['ELEVATED', 'HIGH'].includes(asset.latestRisk?.payload.rating ?? '')
  );
}

function decisionReady(asset: HydratedAsset) {
  return Boolean(asset.latestDna) && !needsReview(asset);
}

function statusPresentation(asset: HydratedAsset) {
  if (decisionReady(asset)) return { label: 'Ready', tone: 'ok' as const };
  if (!asset.latestDna && asset.documentCount > 0) {
    return { label: 'In progress', tone: 'info' as const };
  }
  return { label: 'Needs review', tone: 'warn' as const };
}

function keyInsights(asset: HydratedAsset) {
  const valuation = moneyCompact(
    asset.latestValuation?.payload.amount,
    asset.latestValuation?.payload.currency ?? asset.currency,
  );
  const occupancy = asset.latestDna?.envelope.facts.find((fact) =>
    /occupancy/i.test(fact.key) || /occupancy/i.test(fact.label),
  );
  const confidence = asset.latestDna
    ? confidenceLabel(asset.latestDna.envelope.confidence.overall)
    : null;
  const line1 = asset.latestValuation
    ? `Valuation: ${valuation}`
    : asset.documentCount
      ? `${asset.documentCount} source files`
      : 'No valuation mark yet';
  const line2 = occupancy
    ? `Occupancy: ${occupancy.value}`
    : confidence
      ? `Confidence: ${confidence}`
      : asset.latestDna
        ? `DNA v${asset.latestDna.version}`
        : 'Awaiting extraction';
  return { line1, line2 };
}

export default function IntelligencePage() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ReviewFilter>('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('updated');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  const assetsQuery = useQuery({
    queryKey: ['assets'],
    queryFn: async () => (await api.get<HydratedAsset[]>('/assets')).data,
  });
  const jobsQuery = useQuery({
    queryKey: ['jobs'],
    queryFn: async () => (await api.get<JobRow[]>('/intelligence/jobs')).data,
  });

  const assets = assetsQuery.data ?? [];
  const jobs = jobsQuery.data ?? [];
  const dnaReady = assets.filter((asset) => asset.latestDna).length;
  const evidenceNeeded = assets.filter((asset) => asset.documentCount === 0).length;
  const elevatedRisk = assets.filter((asset) =>
    ['ELEVATED', 'HIGH'].includes(asset.latestRisk?.payload.rating ?? ''),
  ).length;
  const reviewCount = assets.filter(needsReview).length;
  const readyCount = assets.filter(decisionReady).length;

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const riskRank: Record<string, number> = { LOW: 1, MODERATE: 2, ELEVATED: 3, HIGH: 4 };
    let list = assets.filter((asset) => {
      const matchesFilter =
        filter === 'ALL' ||
        (filter === 'REVIEW' ? needsReview(asset) : decisionReady(asset));
      const matchesQuery =
        !term ||
        [asset.name, asset.location, asset.jurisdiction, assetClassLabel[asset.assetClass]]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));
      return matchesFilter && matchesQuery;
    });

    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortKey === 'progress') cmp = dnaProgress(a) - dnaProgress(b);
      else if (sortKey === 'risk') {
        cmp =
          (riskRank[a.latestRisk?.payload.rating ?? ''] ?? 0) -
          (riskRank[b.latestRisk?.payload.rating ?? ''] ?? 0);
      } else {
        cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [assets, filter, query, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const showingFrom = filtered.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const showingTo = Math.min(currentPage * PAGE_SIZE, filtered.length);
  const pageSelected =
    pageItems.length > 0 && pageItems.every((asset) => selected.includes(asset.id));
  const jobsInFlight = jobs.filter(
    (job) => job.status === 'RUNNING' || job.status === 'QUEUED',
  ).length;

  const paginationNumbers = useMemo(() => {
    const maxButtons = 9;
    if (pageCount <= maxButtons) {
      return Array.from({ length: pageCount }, (_, index) => index + 1);
    }
    const start = Math.max(1, Math.min(currentPage - 4, pageCount - maxButtons + 1));
    return Array.from({ length: maxButtons }, (_, index) => start + index);
  }, [pageCount, currentPage]);

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

  return (
    <div className="dna-mgmt dna-mgmt--fit mx-auto w-full max-w-[92rem]">
      <section className="dna-mgmt__hero">
        <div className="dna-mgmt__hero-media" aria-hidden="true">
          <Image
            src="/login-hero-skyline.jpg"
            alt=""
            fill
            priority
            className="object-cover object-[70%_center]"
            sizes="(min-width: 1280px) 40vw, 100vw"
          />
          <div className="dna-mgmt__hero-shade" />
        </div>
        <div className="dna-mgmt__hero-content">
          <div className="dna-mgmt__hero-copy-block">
            <p className="dna-mgmt__eyebrow">Asset DNA</p>
            <h1 className="dna-mgmt__title">Asset intelligence, ready for review</h1>
            <p className="dna-mgmt__hero-copy">
              Validate the evidence behind each Asset DNA snapshot before it informs a decision
              or a Copilot briefing. Incomplete packs stay in review until the facts hold.
            </p>
            <div className="dna-mgmt__hero-actions">
              <Link href="/documents" className="dna-mgmt__btn dna-mgmt__btn--primary">
                <Plus size={15} />
                Add evidence
              </Link>
              <Link href="/intelligence/copilot" className="dna-mgmt__btn">
                <Sparkles size={15} className="text-[var(--gold)]" />
                Open Copilot
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="dna-mgmt__stats">
        {(
          [
            {
              label: 'Assets tracked',
              value: String(assets.length),
              hint: 'Available for intelligence review',
              icon: Building2,
              bars: [4, 6, 5, 8, 7, 9, 8, 10] as number[],
              tone: 'gold' as const,
            },
            {
              label: 'Current snapshots',
              value: String(dnaReady),
              hint: 'Asset DNA is available',
              icon: Layers,
              bars: [3, 5, 6, 7, 8, 8, 9, 10],
              tone: 'gold' as const,
            },
            {
              label: 'Evidence needed',
              value: String(evidenceNeeded),
              hint: 'Upload or process source files',
              icon: FileWarning,
              bars: [8, 7, 6, 5, 5, 4, 3, 3],
              tone: 'danger' as const,
            },
            {
              label: 'Risk flagged',
              value: String(elevatedRisk),
              hint: 'Requires human assessment',
              icon: AlertTriangle,
              bars: [2, 3, 4, 3, 5, 4, 6, 5],
              tone: 'danger' as const,
            },
          ] as const
        ).map((stat) => (
          <article key={stat.label} className="dna-mgmt__stat">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <span className="dna-mgmt__stat-icon">
                <stat.icon size={15} />
              </span>
              <div className="min-w-0">
                <p className="dna-mgmt__stat-label">{stat.label}</p>
                <p className="dna-mgmt__stat-value">{stat.value}</p>
                <p className="dna-mgmt__stat-hint">{stat.hint}</p>
              </div>
            </div>
            <MiniBars className="shrink-0 self-end" values={[...stat.bars]} tone={stat.tone} />
          </article>
        ))}
      </section>

      <section className="dna-mgmt__panel dna-mgmt__workspace">
        <div className="dna-mgmt__toolbar">
          <div className="dna-mgmt__tabs" role="tablist" aria-label="Asset DNA views">
            {(
              [
                ['ALL', `All Assets (${assets.length})`],
                ['REVIEW', `Needs Review (${reviewCount})`],
                ['READY', `Decision Ready (${readyCount})`],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={filter === value}
                className={cn(filter === value && 'is-active')}
                onClick={() => {
                  setFilter(value);
                  setPage(1);
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="dna-mgmt__controls">
            <label className="dna-mgmt__search">
              <Search size={15} aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                placeholder="Search assets…"
              />
            </label>
            <button
              type="button"
              className={cn('dna-mgmt__chip', showFilters && 'is-active')}
              onClick={() => setShowFilters((value) => !value)}
            >
              <Filter size={14} />
              Filters
            </button>
            <button type="button" className="dna-mgmt__chip" onClick={toggleSort}>
              <ArrowDownUp size={14} />
              Sort: {sortKey === 'updated' ? 'Updated' : sortKey === 'name' ? 'Name' : sortKey === 'progress' ? 'Progress' : 'Risk'}
            </button>
          </div>
        </div>

        {showFilters ? (
          <div className="dna-mgmt__filter-row">
            <button type="button" className="dna-mgmt__chip" onClick={() => setSortKey('progress')}>
              Sort by DNA progress
            </button>
            <button type="button" className="dna-mgmt__chip" onClick={() => setSortKey('risk')}>
              Sort by risk
            </button>
            <button type="button" className="dna-mgmt__chip" onClick={() => setSortKey('name')}>
              Sort by name
            </button>
            {(query || filter !== 'ALL') && (
              <button
                type="button"
                className="dna-mgmt__chip"
                onClick={() => {
                  setQuery('');
                  setFilter('ALL');
                  setPage(1);
                }}
              >
                Clear
              </button>
            )}
            <details className="dna-mgmt__filter-settings">
              <summary>AI model settings</summary>
              <div className="dna-mgmt__filter-settings-body">
                <LlmModelPicker />
                <LlmModelPicker purpose="DNA" />
              </div>
            </details>
          </div>
        ) : null}

        <div className="dna-mgmt__table-scroll">
          <table className="dna-mgmt__table w-full min-w-[1080px] text-left text-sm">
            <thead>
              <tr>
                <th className="w-10">
                  <input
                    type="checkbox"
                    checked={pageSelected}
                    onChange={toggleAllOnPage}
                    aria-label="Select all on page"
                  />
                </th>
                <th>Asset</th>
                <th>Class</th>
                <th>DNA progress</th>
                <th>Key insights</th>
                <th>Risk</th>
                <th>Status</th>
                <th>Updated</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {assetsQuery.isLoading ? (
                <tr>
                  <td colSpan={9} className="px-6 py-10 text-center text-sm text-[var(--muted)]">
                    Loading intelligence workspace…
                  </td>
                </tr>
              ) : pageItems.length ? (
                pageItems.map((asset) => {
                  const progress = dnaProgress(asset);
                  const status = statusPresentation(asset);
                  const insights = keyInsights(asset);
                  return (
                    <tr key={asset.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.includes(asset.id)}
                          onChange={() =>
                            setSelected((ids) =>
                              ids.includes(asset.id)
                                ? ids.filter((id) => id !== asset.id)
                                : [...ids, asset.id],
                            )
                          }
                          aria-label={`Select ${asset.name}`}
                        />
                      </td>
                      <td>
                        <Link href={`/intelligence/dna/${asset.id}`} className="dna-mgmt__asset">
                          <span className="dna-mgmt__thumb">
                            {asset.primaryImageUrl ? (
                              <Image
                                src={asset.primaryImageUrl}
                                alt=""
                                fill
                                unoptimized
                                className="object-cover"
                                sizes="40px"
                              />
                            ) : (
                              <Building2 size={14} />
                            )}
                          </span>
                          <span className="min-w-0">
                            <span className="dna-mgmt__asset-name">{asset.name}</span>
                            <span className="dna-mgmt__asset-meta">
                              {asset.location ?? asset.jurisdiction ?? '—'}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="text-[var(--muted)]">{assetClassLabel[asset.assetClass]}</td>
                      <td>
                        <div className="dna-mgmt__progress">
                          <span className="dna-mgmt__meter">
                            <span
                              style={{
                                width: `${progress}%`,
                                background:
                                  progress >= 80
                                    ? 'var(--ok)'
                                    : progress >= 50
                                      ? 'var(--gold)'
                                      : 'var(--warn)',
                              }}
                            />
                          </span>
                          <span className="tabular-nums">{progress}%</span>
                        </div>
                      </td>
                      <td>
                        <span className="block text-[13px] font-medium text-[var(--ink)]">
                          {insights.line1}
                        </span>
                        <span className="mt-0.5 block text-xs text-[var(--muted)]">
                          {insights.line2}
                        </span>
                      </td>
                      <td>
                        <Badge tone={riskTone(asset.latestRisk?.payload.rating)}>
                          {asset.latestRisk?.payload.rating ?? 'n/a'}
                        </Badge>
                      </td>
                      <td>
                        <span
                          className={cn(
                            'dna-mgmt__status',
                            `dna-mgmt__status--${status.tone}`,
                          )}
                        >
                          <span />
                          {status.label}
                        </span>
                      </td>
                      <td className="whitespace-nowrap text-[var(--muted)]">
                        {formatDateTime(asset.updatedAt)}
                      </td>
                      <td>
                        <Link
                          href={`/intelligence/dna/${asset.id}`}
                          className="dna-mgmt__more"
                          aria-label={`Open ${asset.name}`}
                        >
                          <MoreVertical size={15} />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} className="px-6 py-10 text-center text-sm text-[var(--muted)]">
                    No assets match this view. Try another filter or clear your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <footer className="dna-mgmt__footer">
          <p>
            Showing {showingFrom} to {showingTo} of {filtered.length} assets
            {selected.length ? ` · ${selected.length} selected` : ''}
            {jobsInFlight ? ` · ${jobsInFlight} jobs in flight` : ''}
          </p>
          <div className="dna-mgmt__pager">
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
      </section>
    </div>
  );
}
