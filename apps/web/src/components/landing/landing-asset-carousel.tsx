'use client';

import { assetClassLabel } from '@/lib/format';
import type { AssetClass } from '@caprov/types';
import { ChevronLeft, ChevronRight, ShieldCheck, Sparkles } from 'lucide-react';
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
  note: string;
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
    accent: 'from-[#1a2338] via-[#243049] to-[#121a2b]',
    highlight: 'Grade A office · 94% occupancy',
    note: 'Valuation memo, title, and insurance reconciled in Asset DNA.',
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
    accent: 'from-[#1f1a14] via-[#3d2f1c] to-[#15120d]',
    highlight: '11.4% current yield · 96% called',
    note: 'LPA, NAV statement, and GP KYC linked with provenance.',
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
    accent: 'from-[#1a2418] via-[#2f4a2a] to-[#101810]',
    highlight: '42 hectares · Grand Cru classé',
    note: 'Notarial deed and vineyard appraisal under governed review.',
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
    accent: 'from-[#101820] via-[#1c3040] to-[#0a1018]',
    highlight: '2,140 airframe hours · JSSI enrolled',
    note: 'Bill of sale, hull insurance, and residual appraisal on file.',
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
    accent: 'from-[#241818] via-[#4a2820] to-[#140f0f]',
    highlight: 'Condition: excellent · Insured',
    note: 'Gallery invoice and condition report anchored to DNA.',
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
    accent: 'from-[#141820] via-[#243040] to-[#0c1014]',
    highlight: 'Logistics · 100% leased',
    note: 'SPA, JTC title, and valuation memo in one operating record.',
  },
];

const riskLabel = {
  LOW: 'Low risk',
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
    const timer = window.setInterval(next, 5500);
    return () => window.clearInterval(timer);
  }, [next, paused]);

  return (
    <div
      className="landing-asset-carousel landing-console--float flex w-full min-w-0 flex-col overflow-hidden rounded-[1.35rem] border border-[var(--ink)]/10 bg-[var(--card)] shadow-[0_26px_60px_rgba(10,15,26,0.10)] sm:rounded-[1.75rem]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="flex flex-col gap-3 border-b border-[var(--ink)]/10 px-5 pb-5 pt-5 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-7 sm:pt-7">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--gold)]">Curated assets</p>
          <h2 className="mt-2 max-w-sm text-lg font-semibold tracking-[-0.03em] text-[var(--ink)] sm:text-xl">
            Institutional holdings under governed review
          </h2>
        </div>
        <div className="landing-pulse-badge inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border border-[var(--ok)]/16 bg-[var(--ok-soft)] px-3 py-1.5 text-xs font-medium text-[var(--ok)]">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Asset DNA verified
        </div>
      </div>

      <div className="landing-asset-carousel__viewport relative px-5 py-5 sm:px-7 sm:py-6">
        {showcaseAssets.map((item, index) => {
          const isActive = index === active;
          return (
            <article
              key={item.id}
              aria-hidden={!isActive}
              className={`landing-asset-carousel__slide ${isActive ? 'landing-asset-carousel__slide--active' : ''}`}
            >
              <div
                className={`landing-asset-carousel__visual bg-gradient-to-br ${item.accent}`}
              >
                <div className="landing-asset-carousel__visual-grid" aria-hidden="true" />
                <div className="landing-asset-carousel__visual-glow" aria-hidden="true" />
                <div className="relative z-10 flex h-full flex-col justify-between p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-3">
                    <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-white/80 backdrop-blur-sm">
                      {assetClassLabel[item.assetClass]}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--gold)]/25 bg-black/20 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-[var(--gold-soft)]">
                      <Sparkles className="h-3 w-3" aria-hidden="true" />
                      {Math.round(item.confidence * 100)}% confidence
                    </span>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/45">
                      {item.location}
                    </p>
                    <h3 className="mt-2 font-display text-2xl font-semibold tracking-[-0.03em] text-white sm:text-[1.65rem]">
                      {item.name}
                    </h3>
                    <p className="mt-2 text-sm text-white/62">{item.highlight}</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-[var(--ink)]/8 bg-white px-4 py-4">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">{item.markLabel}</p>
                  <p className="mt-2 font-display text-2xl font-semibold tracking-[-0.04em] text-[var(--ink)]">
                    {item.mark}
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--ink)]/8 bg-white px-4 py-4">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">Risk profile</p>
                  <p className="mt-2 text-sm font-medium text-[var(--ink)]">{riskLabel[item.risk]}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">Document-backed review</p>
                </div>
                <div className="rounded-2xl border border-[var(--ink)]/8 bg-[var(--paper)] px-4 py-4 sm:col-span-1">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">Operating record</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{item.note}</p>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-[var(--ink)]/10 px-5 py-4 sm:px-7">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="caprov-touch-target inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--ink)]/10 bg-white text-[var(--ink)] transition hover:border-[var(--gold)]/25 hover:bg-[var(--gold-soft)]"
            aria-label="Previous asset"
            onClick={prev}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="caprov-touch-target inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--ink)]/10 bg-white text-[var(--ink)] transition hover:border-[var(--gold)]/25 hover:bg-[var(--gold-soft)]"
            aria-label="Next asset"
            onClick={next}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="landing-asset-carousel__dots flex flex-wrap items-center justify-end gap-2">
          {showcaseAssets.map((item, index) => (
            <button
              key={item.id}
              type="button"
              aria-label={`View ${item.name}`}
              aria-current={index === active ? 'true' : undefined}
              className={`landing-asset-carousel__dot ${index === active ? 'landing-asset-carousel__dot--active' : ''}`}
              onClick={() => goTo(index)}
            />
          ))}
        </div>
      </div>

      <div className="border-t border-[var(--ink)]/10 bg-[var(--paper)] px-5 py-4 sm:px-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
            {active + 1} of {showcaseAssets.length} private assets · Representative demo portfolio
          </p>
          <Link
            href="/login"
            className="inline-flex min-h-10 items-center justify-center text-sm font-medium text-[var(--ink)] underline-offset-4 transition hover:text-[var(--gold)] hover:underline"
          >
            Review assets in the workspace
          </Link>
        </div>
      </div>
    </div>
  );
}
