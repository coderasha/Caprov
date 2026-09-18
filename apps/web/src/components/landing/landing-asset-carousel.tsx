'use client';

import { assetClassLabel } from '@/lib/format';
import type { AssetClass } from '@caprov/types';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

type ShowcaseAsset = {
  id: string;
  name: string;
  assetClass: AssetClass;
  location: string;
  mark: string;
  markLabel: string;
  confidence: number;
  risk: 'LOW' | 'MODERATE' | 'ELEVATED';
  accent: string;
  highlight: string;
};

const showcaseAssets: ShowcaseAsset[] = [
  {
    id: 'harbourview',
    name: 'Harbourview Tower',
    assetClass: 'REAL_ESTATE',
    location: 'Canary Wharf, London',
    mark: '$92.80m',
    markLabel: 'Market mark',
    confidence: 0.94,
    risk: 'MODERATE',
    accent: 'from-[#151c2c] via-[#1f2a3f] to-[#0e1420]',
    highlight: 'Grade A office · 94% occupancy',
  },
  {
    id: 'aurelia',
    name: 'Aurelia Private Credit Fund III',
    assetClass: 'PRIVATE_CREDIT',
    location: 'Delaware · LP commitment',
    mark: '$48.25m',
    markLabel: 'Latest NAV',
    confidence: 0.91,
    risk: 'MODERATE',
    accent: 'from-[#18140f] via-[#2e2418] to-[#100d08]',
    highlight: '11.4% current yield · 96% called',
  },
  {
    id: 'soleil',
    name: 'Domaine Soleil',
    assetClass: 'AGRICULTURE',
    location: 'Saint-Émilion, France',
    mark: '€18.60m',
    markLabel: 'Market mark',
    confidence: 0.89,
    risk: 'LOW',
    accent: 'from-[#141a13] via-[#243824] to-[#0c100c]',
    highlight: '42 hectares · Grand Cru classé',
  },
  {
    id: 'nimbus',
    name: 'Nimbus G650ER',
    assetClass: 'AVIATION',
    location: 'Isle of Man registry',
    mark: '$31.40m',
    markLabel: 'Market mark',
    confidence: 0.92,
    risk: 'LOW',
    accent: 'from-[#0e141c] via-[#182634] to-[#080c12]',
    highlight: '2,140 airframe hours · JSSI enrolled',
  },
  {
    id: 'kline',
    name: 'Kline Collection — Untitled (1967)',
    assetClass: 'ART',
    location: 'Geneva freeport',
    mark: '$6.75m',
    markLabel: 'Fair value',
    confidence: 0.88,
    risk: 'LOW',
    accent: 'from-[#1c1412] via-[#342018] to-[#100c0a]',
    highlight: 'Condition: excellent · Insured',
  },
  {
    id: 'cedar',
    name: 'Cedar Ridge Industrial Park',
    assetClass: 'INFRASTRUCTURE',
    location: 'Tuas, Singapore',
    mark: 'S$64.20m',
    markLabel: 'Market mark',
    confidence: 0.93,
    risk: 'MODERATE',
    accent: 'from-[#101418] via-[#1c2834] to-[#080a0e]',
    highlight: 'Logistics · 100% leased',
  },
];

const riskLabel = {
  LOW: 'Low',
  MODERATE: 'Moderate',
  ELEVATED: 'Elevated',
} as const;

export function LandingAssetCarousel() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  const goTo = useCallback((index: number) => {
    setActive((index + showcaseAssets.length) % showcaseAssets.length);
  }, []);

  const next = useCallback(() => goTo(active + 1), [active, goTo]);
  const prev = useCallback(() => goTo(active - 1), [active, goTo]);

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(next, 7000);
    return () => window.clearInterval(timer);
  }, [next, paused]);

  const activeAsset = showcaseAssets[active] ?? showcaseAssets[0]!;

  return (
    <div
      className="landing-asset-carousel landing-surface flex w-full min-w-0 flex-col overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="flex items-center justify-between gap-4 border-b border-[var(--ink)]/6 px-6 py-5 sm:px-7">
        <div>
          <p className="landing-kicker">Private asset universe</p>
         
        </div>
        <span className="landing-badge landing-badge--teal shrink-0">Auto-rotating</span>
      </div>

      <div className="landing-asset-carousel__viewport relative px-6 py-6 sm:px-7">
        {showcaseAssets.map((item, index) => {
          const isActive = index === active;
          return (
            <article
              key={item.id}
              aria-hidden={!isActive}
              className={`landing-asset-carousel__slide ${isActive ? 'landing-asset-carousel__slide--active' : ''}`}
            >
              <div className={`landing-asset-carousel__visual bg-gradient-to-br ${item.accent}`}>
                <div className="landing-asset-carousel__visual-shine" aria-hidden="true" />
                <div className="relative z-10 flex h-full min-h-[12.5rem] flex-col justify-between p-6 sm:min-h-[14rem]">
                  <div className="flex items-start justify-between gap-3">
                    <span className="landing-badge landing-badge--glass">{assetClassLabel[item.assetClass]}</span>
                    <span className="text-[11px] uppercase tracking-[0.16em] text-white/50">
                      {Math.round(item.confidence * 100)}% confidence
                    </span>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.2em] text-white/45">{item.location}</p>
                    <h3 className="mt-2 font-display text-[1.65rem] font-semibold leading-tight tracking-[-0.03em] text-white sm:text-[1.85rem]">
                      {item.name}
                    </h3>
                    <p className="mt-2 text-sm text-white/60">{item.highlight}</p>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-px overflow-hidden rounded-2xl border border-[var(--ink)]/6 bg-[var(--ink)]/6 sm:grid-cols-3">
                <div className="bg-white px-5 py-4">
                  <p className="landing-metric-label">{item.markLabel}</p>
                  <p className="landing-metric-value mt-2">{item.mark}</p>
                </div>
                <div className="bg-white px-5 py-4">
                  <p className="landing-metric-label">Risk profile</p>
                  <p className="mt-2 text-sm font-medium text-[var(--ink)]">{riskLabel[item.risk]}</p>
                </div>
                <div className="bg-[var(--paper)] px-5 py-4 sm:col-span-1">
                  <p className="landing-metric-label">Record status</p>
                  <p className="mt-2 text-sm text-[var(--ink)]">Illustrative · Evidence-aware</p>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-[var(--ink)]/6 px-6 py-4 sm:px-7">
        <div className="flex items-center gap-2">
          <button type="button" className="landing-icon-btn" aria-label="Previous asset" onClick={prev}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" className="landing-icon-btn" aria-label="Next asset" onClick={next}>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="landing-asset-carousel__dots flex items-center gap-2">
          {showcaseAssets.map((item, index) => (
            <button
              key={item.id}
              type="button"
              aria-label={'View ' + assetClassLabel[item.assetClass] + ' category: ' + item.name}
              aria-current={index === active ? 'true' : undefined}
              className={`landing-asset-carousel__dot ${index === active ? 'landing-asset-carousel__dot--active' : ''}`}
              onClick={() => goTo(index)}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-[var(--ink)]/6 bg-[var(--paper)]/70 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <p className="text-xs text-[var(--muted)]">
          {assetClassLabel[activeAsset.assetClass]} · {active + 1} of {showcaseAssets.length}
        </p>
        <Link href="/login" className="landing-text-link text-sm">
          Explore Asset DNA
        </Link>
      </div>
    </div>
  );
}
