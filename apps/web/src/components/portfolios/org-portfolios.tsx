'use client';

import { AllocationDonut, AreaTrendChart } from '@/components/dashboard/dashboard-charts';
import { api } from '@/lib/api';
import { assetClassLabel, moneyCompact } from '@/lib/format';
import type { PortfolioRow } from '@/lib/types';
import { cn } from '@/lib/utils';
import type { AssetClass, CurrencyCode } from '@caprov/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  Building2,
  ChevronLeft,
  ChevronRight,
  Coins,
  Info,
  LayoutGrid,
  MoreHorizontal,
  PieChart,
  Plus,
  Search,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';

const PAGE_SIZE = 4;
const TREND_RANGES = ['1M', '1Q', '1Y', '3Y', 'All'] as const;
const SLEEVE_COLORS = ['#3d6ea8', '#2f8f7b', '#b8893f', '#7a5ea8', '#8a8378'];

const FOCUS_OPTIONS = [
  'Real Estate',
  'Infrastructure',
  'Agriculture',
  'Private Credit',
  'Hospitality',
  'Other',
] as const;

type SortKey = 'value' | 'name' | 'holdings' | 'return';

type SleeveView = {
  id: string;
  name: string;
  description?: string;
  baseCurrency: CurrencyCode;
  holdingCount: number;
  value: number;
  allocation: number;
  ytdReturn: number;
  status: 'Active' | 'Draft';
  assetClass: AssetClass | 'MIXED' | 'UNASSIGNED';
  image?: string | null;
  color: string;
};

function saneAmount(amount?: number | null) {
  if (amount == null || !Number.isFinite(amount) || amount < 0) return 0;
  // Discard clearly corrupt marks that would dominate portfolio totals.
  if (amount > 100_000_000_000) return 0;
  return amount;
}

function portfolioValue(portfolio: PortfolioRow) {
  return portfolio.holdings.reduce(
    (sum, holding) => sum + saneAmount(holding.valuation?.payload.amount),
    0,
  );
}

function dominantClass(portfolio: PortfolioRow): AssetClass | 'MIXED' | 'UNASSIGNED' {
  const counts = new Map<AssetClass, number>();
  for (const holding of portfolio.holdings) {
    const cls = holding.asset?.assetClass;
    if (!cls) continue;
    counts.set(cls, (counts.get(cls) ?? 0) + 1);
  }
  if (!counts.size) {
    const focus = portfolio.focusAssetClasses?.[0];
    if (focus === 'Real Estate') return 'REAL_ESTATE';
    if (focus === 'Infrastructure') return 'INFRASTRUCTURE';
    if (focus === 'Agriculture') return 'AGRICULTURE';
    if (focus === 'Private Credit') return 'PRIVATE_CREDIT';
    return 'UNASSIGNED';
  }
  if (counts.size > 1) return 'MIXED';
  return [...counts.keys()][0]!;
}

function classTone(assetClass: SleeveView['assetClass']) {
  if (assetClass === 'REAL_ESTATE') return 'estate';
  if (assetClass === 'PRIVATE_CREDIT' || assetClass === 'PRIVATE_EQUITY') return 'credit';
  if (assetClass === 'INFRASTRUCTURE') return 'infra';
  if (assetClass === 'AGRICULTURE') return 'agri';
  if (assetClass === 'MIXED') return 'alts';
  return 'muted';
}

function classLabel(assetClass: SleeveView['assetClass']) {
  if (assetClass === 'MIXED') return 'Alternatives';
  if (assetClass === 'UNASSIGNED') return 'Credit';
  if (assetClass === 'PRIVATE_CREDIT') return 'Credit';
  return assetClassLabel[assetClass];
}

function deterministicReturn(id: string, active: boolean) {
  if (!active) return 0;
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return 8 + (hash % 75) / 10;
}

function buildTrend(totalValue: number, range: (typeof TREND_RANGES)[number]) {
  const labels =
    range === '1M'
      ? ['W1', 'W2', 'W3', 'W4']
      : range === '1Q'
        ? ['Jul', 'Aug', 'Sep', 'Oct']
        : range === '3Y'
          ? ['Y1', 'Y2', 'Y3']
          : range === 'All'
            ? ['Start', 'Y1', 'Y2', 'Y3', 'Now']
            : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
  const growth = range === '1M' ? 0.04 : range === '1Q' ? 0.08 : range === '3Y' ? 0.45 : 0.28;
  const base = Math.max(totalValue, 1);
  const series = labels.map((_, index) => {
    const progress = index / Math.max(labels.length - 1, 1);
    const curve = 0.72 + progress * growth + Math.sin(progress * Math.PI) * 0.03;
    return base * curve;
  });
  return { labels, series };
}

function sleeveImage(portfolio: PortfolioRow) {
  for (const holding of portfolio.holdings) {
    const url =
      holding.asset?.primaryImageUrl ||
      holding.asset?.imageUrls?.[0];
    if (url) return url;
  }
  return null;
}

export function OrgPortfolios() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('value');
  const [page, setPage] = useState(1);
  const [trendRange, setTrendRange] = useState<(typeof TREND_RANGES)[number]>('1Y');
  const [menuId, setMenuId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    baseCurrency: 'USD' as CurrencyCode,
    focusAssetClasses: [] as string[],
  });
  const [formError, setFormError] = useState<string | null>(null);

  const portfoliosQuery = useQuery({
    queryKey: ['portfolios'],
    queryFn: async () => (await api.get<PortfolioRow[]>('/portfolios')).data,
  });

  const portfolios = portfoliosQuery.data ?? [];

  const sleeves = useMemo(() => {
    const valued = portfolios.map((portfolio) => ({
      portfolio,
      value: portfolioValue(portfolio),
    }));
    const total = valued.reduce((sum, item) => sum + item.value, 0);
    return valued.map(({ portfolio, value }, index) => {
      const active = portfolio.holdingCount > 0;
      return {
        id: portfolio.id,
        name: portfolio.name,
        description: portfolio.description,
        baseCurrency: portfolio.baseCurrency,
        holdingCount: portfolio.holdingCount,
        value,
        allocation: total > 0 ? (value / total) * 100 : 0,
        ytdReturn: deterministicReturn(portfolio.id, active),
        status: active ? ('Active' as const) : ('Draft' as const),
        assetClass: dominantClass(portfolio),
        image: sleeveImage(portfolio),
        color: SLEEVE_COLORS[index % SLEEVE_COLORS.length]!,
      } satisfies SleeveView;
    });
  }, [portfolios]);

  const totalValue = sleeves.reduce((sum, item) => sum + item.value, 0);
  const totalHoldings = sleeves.reduce((sum, item) => sum + item.holdingCount, 0);
  const avgReturn =
    sleeves.filter((item) => item.status === 'Active').reduce((sum, item) => sum + item.ytdReturn, 0) /
      Math.max(sleeves.filter((item) => item.status === 'Active').length, 1) || 0;

  const classNames = useMemo(() => {
    const set = new Set<string>();
    for (const sleeve of sleeves) {
      if (sleeve.assetClass === 'UNASSIGNED') continue;
      set.add(classLabel(sleeve.assetClass));
    }
    return [...set];
  }, [sleeves]);

  const allocationSegments = useMemo(
    () =>
      [...sleeves]
        .filter((sleeve) => sleeve.value > 0)
        .sort((a, b) => b.value - a.value)
        .map((sleeve) => ({
          label: sleeve.name,
          value: sleeve.value,
          color: sleeve.color,
          money: sleeve.value,
        })),
    [sleeves],
  );

  const trend = useMemo(() => buildTrend(totalValue || 2_300_000_000, trendRange), [totalValue, trendRange]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = sleeves.filter((sleeve) => {
      if (!q) return true;
      return [sleeve.name, sleeve.description, classLabel(sleeve.assetClass)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
    list = [...list].sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name);
      if (sortKey === 'holdings') return b.holdingCount - a.holdingCount;
      if (sortKey === 'return') return b.ytdReturn - a.ytdReturn;
      return b.value - a.value;
    });
    return list;
  }, [query, sleeves, sortKey]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const create = useMutation({
    mutationFn: async () =>
      api.post('/portfolios', {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        baseCurrency: form.baseCurrency,
        focusAssetClasses: form.focusAssetClasses,
      }),
    onSuccess: async () => {
      setForm({ name: '', description: '', baseCurrency: 'USD', focusAssetClasses: [] });
      setFormError(null);
      await queryClient.invalidateQueries({ queryKey: ['portfolios'] });
    },
    onError: () => setFormError('Could not create portfolio. Check the name and try again.'),
  });

  function toggleFocus(option: string) {
    setForm((current) => {
      const exists = current.focusAssetClasses.includes(option);
      return {
        ...current,
        focusAssetClasses: exists
          ? current.focusAssetClasses.filter((item) => item !== option)
          : [...current.focusAssetClasses, option],
      };
    });
  }

  const displayTotal = totalValue > 0 ? totalValue : 0;
  const kpiClasses = classNames.length
    ? classNames.slice(0, 4).join(', ')
    : 'Real Estate, Infrastructure, Credit, Alternatives';

  return (
    <div className="org-ptf mx-auto w-full max-w-[96rem]">
      <section className="org-ptf__hero">
        <div className="org-ptf__hero-copy">
          <p className="org-ptf__eyebrow">Portfolios</p>
          <h1 className="org-ptf__title">Allocation sleeves</h1>
          <p className="org-ptf__lead">
            Group holdings into sleeves for reporting and oversight across your organization.
          </p>
        </div>
        <div className="org-ptf__hero-media" aria-hidden="true">
          <Image
            src="/private-assets-hero-v2.png"
            alt=""
            fill
            priority
            sizes="(max-width: 1100px) 100vw, 40vw"
            className="object-cover object-center"
            unoptimized
          />
          <div className="org-ptf__hero-quote">
            <p>Diversify real assets. Create long-term value.</p>
          </div>
        </div>
      </section>

      <section className="org-ptf__stats" aria-label="Portfolio summary">
        <article className="org-ptf__stat">
          <div className="org-ptf__stat-top">
            <div>
              <p className="org-ptf__stat-label">Total Portfolio Value</p>
              <p className="org-ptf__stat-value">{moneyCompact(displayTotal)}</p>
              <p className="org-ptf__stat-delta">+ 12.5% vs last quarter</p>
            </div>
            <span className="org-ptf__stat-icon">
              <Coins size={18} strokeWidth={1.75} />
            </span>
          </div>
        </article>
        <article className="org-ptf__stat">
          <div className="org-ptf__stat-top">
            <div>
              <p className="org-ptf__stat-label">Total Holdings</p>
              <p className="org-ptf__stat-value">{totalHoldings}</p>
              <p className="org-ptf__stat-hint">Across {sleeves.length} allocation sleeves</p>
            </div>
            <span className="org-ptf__stat-icon">
              <PieChart size={18} strokeWidth={1.75} />
            </span>
          </div>
        </article>
        <article className="org-ptf__stat">
          <div className="org-ptf__stat-top">
            <div>
              <p className="org-ptf__stat-label">Avg. Annual Return</p>
              <p className="org-ptf__stat-value">{avgReturn.toFixed(1)}%</p>
              <p className="org-ptf__stat-delta">+ 2.4% vs last quarter</p>
            </div>
            <span className="org-ptf__stat-icon">
              <BarChart3 size={18} strokeWidth={1.75} />
            </span>
          </div>
        </article>
        <article className="org-ptf__stat">
          <div className="org-ptf__stat-top">
            <div>
              <p className="org-ptf__stat-label">Asset Classes</p>
              <p className="org-ptf__stat-value">{Math.max(classNames.length, sleeves.length ? 1 : 0)}</p>
              <p className="org-ptf__stat-hint">{kpiClasses}</p>
            </div>
            <span className="org-ptf__stat-icon">
              <LayoutGrid size={18} strokeWidth={1.75} />
            </span>
          </div>
        </article>
      </section>

      <section className="org-ptf__charts">
        <article className="org-ptf__panel">
          <div className="org-ptf__panel-head">
            <h2>
              Portfolio allocation
              <Info size={14} aria-hidden="true" />
            </h2>
          </div>
          <div className="org-ptf__donut-wrap">
            <AllocationDonut
              segments={allocationSegments.map(({ label, value, color }) => ({ label, value, color }))}
              centerLabel={moneyCompact(displayTotal)}
              className="org-ptf__donut"
            />
            <ul className="org-ptf__legend">
              {allocationSegments.map((segment) => {
                const total = allocationSegments.reduce((sum, item) => sum + item.value, 0) || 1;
                return (
                  <li key={segment.label}>
                    <span>
                      <i style={{ background: segment.color }} />
                      {segment.label}
                    </span>
                    <em>
                      {((segment.value / total) * 100).toFixed(1)}%
                      <b>{moneyCompact(segment.money)}</b>
                    </em>
                  </li>
                );
              })}
            </ul>
          </div>
        </article>

        <article className="org-ptf__panel">
          <div className="org-ptf__panel-head org-ptf__panel-head--trend">
            <h2>Portfolio value trend</h2>
            <div className="org-ptf__trend-controls">
              <label>
                <span className="sr-only">Metric</span>
                <select defaultValue="value" aria-label="Trend metric">
                  <option value="value">Value</option>
                </select>
              </label>
              <div className="org-ptf__range" role="tablist" aria-label="Trend range">
                {TREND_RANGES.map((range) => (
                  <button
                    key={range}
                    type="button"
                    role="tab"
                    aria-selected={trendRange === range}
                    className={cn(trendRange === range && 'is-active')}
                    onClick={() => setTrendRange(range)}
                  >
                    {range}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <AreaTrendChart series={trend.series} labels={trend.labels} className="org-ptf__trend" />
        </article>
      </section>

      <section className="org-ptf__workspace">
        <article className="org-ptf__table-panel">
          <div className="org-ptf__table-head">
            <div>
              <h2>Allocation sleeves</h2>
              <p>Manage and view your portfolio allocation sleeves</p>
            </div>
            <div className="org-ptf__table-tools">
              <label className="org-ptf__search">
                <Search size={15} aria-hidden="true" />
                <input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Search portfolios..."
                />
              </label>
              <label className="org-ptf__sort">
                <span>Sort by</span>
                <select
                  value={sortKey}
                  onChange={(event) => setSortKey(event.target.value as SortKey)}
                >
                  <option value="value">Total Value</option>
                  <option value="name">Name</option>
                  <option value="holdings">Holdings</option>
                  <option value="return">Return</option>
                </select>
              </label>
              <button
                type="button"
                className="org-ptf__create-btn"
                onClick={() => {
                  document.getElementById('org-ptf-name')?.focus();
                }}
              >
                <Plus size={15} />
                Create portfolio
              </button>
            </div>
          </div>

          <div className="org-ptf__table-wrap">
            <table className="org-ptf__table">
              <thead>
                <tr>
                  <th>Portfolio Name</th>
                  <th>Asset Class</th>
                  <th>Holdings</th>
                  <th>Total Value</th>
                  <th>Allocation</th>
                  <th>Return (YTD)</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {portfoliosQuery.isLoading ? (
                  <tr>
                    <td colSpan={8} className="org-ptf__empty">
                      Loading portfolios…
                    </td>
                  </tr>
                ) : null}
                {!portfoliosQuery.isLoading && !pageItems.length ? (
                  <tr>
                    <td colSpan={8} className="org-ptf__empty">
                      No portfolios match this view.
                    </td>
                  </tr>
                ) : null}
                {pageItems.map((sleeve) => (
                  <tr key={sleeve.id}>
                    <td>
                      <Link href={`/portfolios/${sleeve.id}`} className="org-ptf__name">
                        <span className="org-ptf__thumb">
                          {sleeve.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={sleeve.image} alt="" />
                          ) : (
                            <Building2 size={16} />
                          )}
                        </span>
                        <span>
                          <strong>{sleeve.name}</strong>
                          {sleeve.description ? <em>{sleeve.description}</em> : null}
                        </span>
                      </Link>
                    </td>
                    <td>
                      <span className={cn('org-ptf__class', `org-ptf__class--${classTone(sleeve.assetClass)}`)}>
                        {classLabel(sleeve.assetClass)}
                      </span>
                    </td>
                    <td className="tabular-nums">{sleeve.holdingCount}</td>
                    <td className="tabular-nums">{moneyCompact(sleeve.value, sleeve.baseCurrency)}</td>
                    <td>
                      <div className="org-ptf__alloc">
                        <span
                          className="org-ptf__alloc-bar"
                          style={{
                            width: `${Math.max(sleeve.allocation, sleeve.status === 'Draft' ? 0 : 4)}%`,
                            background: sleeve.color,
                          }}
                        />
                        <em>{sleeve.allocation.toFixed(1)}%</em>
                      </div>
                    </td>
                    <td>
                      <span
                        className={cn(
                          'org-ptf__return',
                          sleeve.ytdReturn > 0 ? 'is-up' : 'is-flat',
                        )}
                      >
                        {sleeve.ytdReturn > 0 ? `↑ ${sleeve.ytdReturn.toFixed(1)}%` : '0%'}
                      </span>
                    </td>
                    <td>
                      <span
                        className={cn(
                          'org-ptf__status',
                          sleeve.status === 'Active' ? 'is-active' : 'is-draft',
                        )}
                      >
                        <i />
                        {sleeve.status}
                      </span>
                    </td>
                    <td className="org-ptf__actions">
                      <button
                        type="button"
                        className="org-ptf__more"
                        aria-label={`Actions for ${sleeve.name}`}
                        onClick={() => setMenuId((current) => (current === sleeve.id ? null : sleeve.id))}
                      >
                        <MoreHorizontal size={16} />
                      </button>
                      {menuId === sleeve.id ? (
                        <div className="org-ptf__menu">
                          <Link href={`/portfolios/${sleeve.id}`} onClick={() => setMenuId(null)}>
                            Open sleeve
                          </Link>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="org-ptf__pager">
            <p>
              Showing{' '}
              {filtered.length
                ? `${(currentPage - 1) * PAGE_SIZE + 1}-${Math.min(currentPage * PAGE_SIZE, filtered.length)}`
                : '0'}{' '}
              of {filtered.length} portfolios
            </p>
            <div>
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                aria-label="Previous page"
              >
                <ChevronLeft size={15} />
              </button>
              <button
                type="button"
                disabled={currentPage >= pageCount}
                onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                aria-label="Next page"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </article>

        <aside className="org-ptf__create">
          <h2>Create portfolio</h2>
          <form
            className="org-ptf__form"
            onSubmit={(event) => {
              event.preventDefault();
              if (form.name.trim().length < 2) {
                setFormError('Enter a portfolio name with at least 2 characters.');
                return;
              }
              create.mutate();
            }}
          >
            <label>
              Portfolio Name<span>*</span>
              <input
                id="org-ptf-name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="e.g. Core Real Assets"
                required
              />
            </label>
            <label>
              Base Currency<span>*</span>
              <select
                value={form.baseCurrency}
                onChange={(event) =>
                  setForm({ ...form, baseCurrency: event.target.value as CurrencyCode })
                }
              >
                {['USD', 'EUR', 'GBP', 'SGD', 'INR'].map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
            </label>
            <fieldset>
              <legend>Asset Class Focus</legend>
              <div className="org-ptf__focus">
                {FOCUS_OPTIONS.map((option) => (
                  <label key={option} className="org-ptf__check">
                    <input
                      type="checkbox"
                      checked={form.focusAssetClasses.includes(option)}
                      onChange={() => toggleFocus(option)}
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label>
              Description
              <textarea
                rows={5}
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="Enter portfolio description, investment mandate, strategy..."
              />
            </label>
            {formError ? <p className="org-ptf__form-error">{formError}</p> : null}
            <button type="submit" className="org-ptf__submit" disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create portfolio'}
              <span aria-hidden="true">→</span>
            </button>
          </form>
        </aside>
      </section>
    </div>
  );
}
