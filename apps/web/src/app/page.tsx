import { CaprovWordmark } from '@/components/brand/caprov-logo';
import { LandingAssetCarousel } from '@/components/landing/landing-asset-carousel';
import { LandingHeader } from '@/components/landing/landing-header';
import { LandingReveal } from '@/components/landing/landing-reveal';
import { LandingSectionHeader } from '@/components/landing/landing-section-header';
import { LandingStat } from '@/components/landing/landing-stat';
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  FileSearch,
  Scale,
  ShieldCheck,
  Sparkles,
  Store,
  Workflow,
} from 'lucide-react';
import Link from 'next/link';

const proofPoints = [
  { label: 'Asset review', value: 'Document-backed diligence' },
  { label: 'Operating record', value: 'Versioned Asset DNA' },
  { label: 'Execution layer', value: 'Portfolio to lending' },
] as const;

const trustMarquee = [
  'Family offices',
  'Private credit',
  'Asset managers',
  'Fund administrators',
  'Compliance teams',
  'Portfolio operations',
] as const;

const platformModules = [
  {
    icon: FileSearch,
    title: 'Intelligence engine',
    body: 'Deterministic extraction, valuation marks, risk scoring, and copilot synthesis over governed evidence.',
  },
  {
    icon: Building2,
    title: 'Asset DNA',
    body: 'A versioned operating record for ownership, timeline, valuation, risk, and supporting provenance.',
  },
  {
    icon: Store,
    title: 'Marketplace & trading',
    body: 'List private assets, place orders, match trades, and move into settlement with full audit coverage.',
  },
  {
    icon: ShieldCheck,
    title: 'Tokenization',
    body: 'Mint asset tokens on Polygon Amoy with simulated or live on-chain execution.',
  },
  {
    icon: Scale,
    title: 'Collateral & lending',
    body: 'Pledge assets, track advanceable value, open facilities, and manage LTV with release controls.',
  },
  {
    icon: Workflow,
    title: 'Audit & control',
    body: 'Organization RBAC, approval flows, immutable activity logs, and operator-grade visibility.',
  },
] as const;

const workflowSteps = [
  { step: '01', title: 'Ingest', detail: 'Upload and classify source documents with provenance anchors.' },
  { step: '02', title: 'Review', detail: 'Extract facts, valuation marks, and risk signals into Asset DNA.' },
  { step: '03', title: 'Operate', detail: 'Manage portfolios, listings, and institutional approvals.' },
  { step: '04', title: 'Execute', detail: 'Trade, settle, tokenize, collateralize, and lend against the record.' },
] as const;

const platformPillars = [
  {
    title: 'Documents to facts',
    body: 'Title, sale, valuation, KYC, and supporting files become reviewable, provenance-linked facts.',
  },
  {
    title: 'Asset DNA',
    body: 'A versioned operating record for ownership, timeline, valuation, risk, and supporting evidence.',
  },
  {
    title: 'Operator control',
    body: 'Organizations, approvals, portfolios, and audit remain in the core business system of record.',
  },
] as const;

export default function Home() {
  return (
    <main className="landing-page min-h-screen bg-[var(--paper)] text-[var(--text)]">
      <section className="landing-hero relative isolate overflow-hidden">
        <div className="landing-hero__backdrop" aria-hidden="true" />
        <div className="landing-hero__mesh" aria-hidden="true" />

        <div className="relative z-10 w-full">
          <LandingHeader />

          <div className="landing-shell pb-14 pt-8 sm:pb-20 sm:pt-10">
            <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12 xl:gap-14">
              <div className="landing-fade landing-fade--delay-1 min-w-0">
                <p className="landing-kicker inline-flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-[var(--gold)]" aria-hidden="true" />
                  Trusted operating record
                </p>
                <h1 className="landing-hero-title mt-6">
                  Private asset intelligence for teams that move with conviction.
                </h1>
                <p className="landing-lead landing-read mt-5">
                  CAPROV gives investment, operations, and control teams a disciplined way to turn
                  source documents into structured intelligence that holds up across diligence,
                  portfolio oversight, financing, and market workflows.
                </p>
                <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                  <Link href="/login" className="landing-btn landing-btn--primary group w-full sm:w-auto">
                    Open demo workspace
                    <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
                  </Link>
                  <Link href="/register" className="landing-btn landing-btn--ghost w-full sm:w-auto">
                    Create your firm
                  </Link>
                </div>

                <div className="landing-proof-strip mt-10 hidden sm:grid sm:grid-cols-3 sm:gap-6">
                  {proofPoints.map((item) => (
                    <div key={item.label} className="landing-proof-strip__item">
                      <p className="landing-metric-label">{item.label}</p>
                      <p className="mt-2 text-sm font-medium text-[var(--ink)]">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="landing-fade landing-fade--delay-2 min-w-0 w-full">
                <LandingAssetCarousel />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-marquee border-y border-[var(--line)]/80 bg-[var(--card)]" aria-label="Built for institutional teams">
        <div className="landing-marquee__track py-4">
          {[...trustMarquee, ...trustMarquee].map((item, index) => (
            <span key={`${item}-${index}`} className="landing-marquee__item">
              {item}
            </span>
          ))}
        </div>
      </section>

      <section className="landing-section border-b border-[var(--line)]/80 bg-[var(--paper)] py-12 sm:py-14">
        <div className="landing-shell">
          <div className="landing-stats grid grid-cols-2 gap-8 lg:grid-cols-4">
            <LandingStat value={12} suffix="+" label="Integrated modules" />
            <LandingStat value={99.9} suffix="%" label="Audit trail coverage" />
            <LandingStat value={3} label="Core workflow stages" />
            <LandingStat value={24} suffix="/7" label="Operating visibility" />
          </div>
        </div>
      </section>

      <section id="platform" className="landing-section border-b border-[var(--line)]/80 bg-[var(--paper)]">
        <div className="landing-shell">
          <LandingReveal>
            <LandingSectionHeader
              kicker="Platform"
              title="Built for teams that need clarity before they move capital"
              description="CAPROV gives investment, operations, and control teams a shared workflow for turning fragmented source material into usable intelligence."
            />
            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {platformPillars.map((item, index) => (
                <LandingReveal key={item.title} delay={index * 80}>
                  <article className="landing-surface landing-surface--flat h-full p-6">
                    <h3 className="text-base font-semibold text-[var(--ink)]">{item.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{item.body}</p>
                  </article>
                </LandingReveal>
              ))}
            </div>
          </LandingReveal>
        </div>
      </section>

      <section id="workflow" className="landing-section border-b border-[var(--line)]/80 bg-[var(--card)]">
        <div className="landing-shell">
          <LandingReveal>
            <LandingSectionHeader
              kicker="Workflow"
              title="A disciplined path from evidence to execution"
            />
          </LandingReveal>

          <div className="landing-workflow mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {workflowSteps.map((item, index) => (
              <LandingReveal key={item.step} delay={index * 90}>
                <article className="landing-surface landing-surface--flat landing-workflow-step relative h-full p-6">
                  <p className="font-mono text-xs tracking-[0.18em] text-[var(--gold)]">{item.step}</p>
                  <h3 className="mt-4 text-lg font-semibold text-[var(--ink)]">{item.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{item.detail}</p>
                  {index < workflowSteps.length - 1 ? (
                    <span className="landing-workflow-connector hidden xl:block" aria-hidden="true" />
                  ) : null}
                </article>
              </LandingReveal>
            ))}
          </div>
        </div>
      </section>

      <section id="markets" className="landing-section border-b border-[var(--line)]/80 bg-[var(--paper)]">
        <div className="landing-shell">
          <LandingReveal>
            <LandingSectionHeader
              kicker="Capital markets"
              title="Intelligence that carries into market execution"
              description="The same Asset DNA that powers diligence also anchors listings, trading, settlement, tokenization, collateral, and lending workflows."
              action={
                <Link href="/login" className="landing-btn landing-btn--ghost w-full sm:w-auto">
                  Explore modules
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              }
            />
          </LandingReveal>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {platformModules.map((item, index) => {
              const Icon = item.icon;
              return (
                <LandingReveal key={item.title} delay={index * 60}>
                  <article className="landing-surface landing-module-card group h-full p-6">
                    <div className="landing-module-icon">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <h3 className="mt-5 text-base font-semibold text-[var(--ink)]">{item.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{item.body}</p>
                  </article>
                </LandingReveal>
              );
            })}
          </div>
        </div>
      </section>

      <section id="security" className="landing-section border-b border-[var(--line)]/80 bg-[var(--card)]">
        <div className="landing-shell">
          <LandingReveal>
            <div className="landing-surface grid gap-8 p-6 sm:p-8 lg:grid-cols-[0.85fr_1.15fr] lg:p-10">
              <div>
                <div className="landing-badge landing-badge--teal inline-flex items-center gap-2">
                  <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  Governance by design
                </div>
                <h2 className="landing-title mt-6">Professional controls for regulated workflows</h2>
                <p className="landing-lead mt-4 max-w-md">
                  Role-based access, approval-based onboarding, immutable audit logs, and provenance-linked
                  intelligence give control teams confidence in every action.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  'Organization RBAC with analyst, compliance, and admin roles',
                  'Deterministic extraction with insurance-value rejection rules',
                  'Versioned Asset DNA with provenance anchors',
                  'Full activity audit across intelligence and capital markets',
                ].map((item) => (
                  <div key={item} className="rounded-xl border border-[var(--ink)]/6 bg-[var(--paper)] px-4 py-4 text-sm leading-6 text-[var(--ink)]">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </LandingReveal>
        </div>
      </section>

      <section className="landing-cta-band relative overflow-hidden">
        <div className="landing-cta-band__glow" aria-hidden="true" />
        <div className="landing-shell landing-section relative">
          <LandingReveal>
            <div className="mx-auto max-w-2xl text-center">
              <p className="landing-kicker text-[var(--gold-soft)]/90">Ready to operate</p>
              <h2 className="landing-title mt-4 text-white">Bring institutional discipline to private asset workflows</h2>
              <p className="mx-auto mt-5 max-w-lg text-base leading-7 text-white/65">
                Start with the demo workspace, onboard your organization, and move from document review
                to portfolio and market execution on one platform.
              </p>
              <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                <Link href="/login" className="landing-btn landing-btn--light group w-full sm:w-auto">
                  Open demo workspace
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
                <Link href="/register" className="landing-btn landing-btn--outline-light w-full sm:w-auto">
                  Create your firm
                </Link>
              </div>
            </div>
          </LandingReveal>
        </div>
      </section>

      <footer className="bg-[var(--ink)] text-white/65">
        <div className="landing-shell landing-section">
          <div className="landing-footer__grid grid gap-10 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-start lg:justify-between">
            <div className="landing-footer__brand min-w-0">
              <CaprovWordmark className="font-display text-lg font-semibold text-white" markClassName="text-[var(--gold)]" />
              <p className="mt-4 max-w-sm text-sm leading-7 text-white/50">
                AI-first private asset intelligence built around Asset DNA, provenance, and institutional control.
              </p>
            </div>
            <div className="landing-footer__links lg:text-right">
              <p className="landing-metric-label text-white/35">Platform</p>
              <ul className="mt-4 space-y-2.5 text-sm">
                <li><Link href="/login" className="transition hover:text-white">Demo workspace</Link></li>
                <li><a href="#platform" className="transition hover:text-white">Capabilities</a></li>
                <li><a href="#markets" className="transition hover:text-white">Capital markets</a></li>
              </ul>
            </div>
            <div className="landing-footer__account lg:text-right">
              <p className="landing-metric-label text-white/35">Account</p>
              <ul className="mt-4 space-y-2.5 text-sm">
                <li><Link href="/login" className="transition hover:text-white">Sign in</Link></li>
                <li><Link href="/register" className="transition hover:text-white">Register organization</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-10 flex flex-col gap-3 border-t border-white/8 pt-6 text-xs text-white/35 sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} CAPROV. All rights reserved.</p>
            <p>Built for institutional private asset operations</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
