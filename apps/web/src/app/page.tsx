import { CaprovWordmark } from '@/components/brand/caprov-logo';
import { LandingAssetCarousel } from '@/components/landing/landing-asset-carousel';
import { LandingHeader } from '@/components/landing/landing-header';
import { LandingReveal } from '@/components/landing/landing-reveal';
import { LandingStat } from '@/components/landing/landing-stat';
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  FileSearch,
  Landmark,
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
    body: 'Mint ERC-1155 style asset tokens on Polygon Amoy with simulated or live on-chain execution.',
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

export default function Home() {
  return (
    <main className="landing-page min-h-screen bg-[var(--paper)] text-[var(--text)]">
      <section className="landing-hero relative isolate overflow-hidden border-b border-[var(--line)]">
        <div className="landing-hero__backdrop" aria-hidden="true" />
        <div className="landing-hero__mesh" aria-hidden="true" />
        <div className="landing-hero__grain" aria-hidden="true" />
        <div className="landing-hero__halo landing-hero__halo--one" aria-hidden="true" />
        <div className="landing-hero__halo landing-hero__halo--two" aria-hidden="true" />
        <div className="landing-hero__beam" aria-hidden="true" />

        <div className="relative z-10 w-full">
          <LandingHeader />

          <div className="landing-shell pb-12 pt-6 sm:pb-20 sm:pt-10">
            <div className="grid items-stretch gap-8 md:gap-10 xl:grid-cols-[minmax(0,1.08fr)_minmax(380px,0.92fr)] xl:gap-16">
              <div className="landing-fade landing-fade--delay-1 flex flex-col justify-center">
                <div className="landing-eyebrow inline-flex w-fit max-w-full items-center gap-2 rounded-full border border-[var(--gold)]/18 bg-[var(--gold-soft)] px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-[var(--gold)] sm:text-[11px] sm:tracking-[0.22em]">
                  <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  Trusted operating record
                </div>
                <h1 className="landing-headline mt-5 max-w-4xl font-display text-[clamp(2.2rem,7vw,5.4rem)] font-semibold leading-[1.02] tracking-[-0.05em] text-[var(--ink)] sm:mt-6 sm:leading-[0.98]">
                  Private asset intelligence for teams that move with conviction.
                </h1>
                <p className="mt-5 max-w-2xl text-[0.98rem] leading-7 text-[var(--ink)]/74 sm:mt-6 sm:text-lg sm:leading-8">
                  CAPROV gives investment, operations, and control teams a disciplined way to turn
                  source documents into structured intelligence that holds up across diligence,
                  portfolio oversight, financing, and market workflows.
                </p>
                <div className="mt-7 flex w-full flex-col gap-3 sm:mt-10 sm:w-auto sm:flex-row sm:flex-wrap">
                  <Link
                    href="/login"
                    className="landing-cta group inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--ink)] px-6 py-3.5 text-sm font-medium text-white transition hover:bg-[#1a2338] sm:w-auto"
                  >
                    Open the demo workspace
                    <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
                  </Link>
                  <Link
                    href="/register"
                    className="inline-flex min-h-12 w-full items-center justify-center rounded-full border border-[var(--ink)]/18 bg-white px-6 py-3.5 text-sm font-medium text-[var(--ink)] transition hover:border-[var(--ink)]/36 hover:bg-[var(--card)] sm:w-auto"
                  >
                    Create your firm
                  </Link>
                </div>
                <div className="mt-8 grid gap-3 sm:mt-10 sm:grid-cols-3 sm:gap-4">
                  {proofPoints.map((item, index) => (
                    <div
                      key={item.label}
                      className="landing-proof rounded-2xl border border-[var(--ink)]/10 bg-white p-5 shadow-[0_12px_28px_rgba(10,15,26,0.04)]"
                      style={{ animationDelay: `${0.28 + index * 0.1}s` }}
                    >
                      <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">{item.label}</p>
                      <p className="mt-2 text-sm font-medium text-[var(--ink)]">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="landing-fade landing-fade--delay-2 flex min-w-0">
                <LandingAssetCarousel />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-marquee border-y border-[var(--line)] bg-[var(--card)] py-4" aria-label="Built for institutional teams">
        <div className="landing-marquee__track">
          {[...trustMarquee, ...trustMarquee].map((item, index) => (
            <span key={`${item}-${index}`} className="landing-marquee__item">
              {item}
            </span>
          ))}
        </div>
      </section>

      <section className="border-b border-[var(--line)] bg-[var(--paper)] py-12 sm:py-16">
        <div className="landing-shell">
          <div className="landing-stats grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-8 lg:grid-cols-4">
            <LandingStat value={12} suffix="+" label="Integrated modules" />
            <LandingStat value={99.9} suffix="%" label="Audit trail coverage" />
            <LandingStat value={3} label="Core workflow stages" />
            <LandingStat value={24} suffix="/7" label="Operating visibility" />
          </div>
        </div>
      </section>

      <section id="platform" className="border-b border-[var(--line)] bg-[var(--paper)]">
        <div className="landing-shell py-14 sm:py-20">
          <LandingReveal>
            <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--gold)]">Platform</p>
                <h2 className="mt-4 font-display text-[clamp(1.75rem,4.5vw,2.5rem)] font-semibold tracking-[-0.03em] text-[var(--ink)]">
                  Built for teams that need clarity before they move capital
                </h2>
                <p className="mt-5 max-w-md text-base leading-7 text-[var(--muted)]">
                  CAPROV gives investment, operations, and control teams a shared workflow for turning
                  fragmented source material into usable intelligence.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 sm:gap-6 xl:grid-cols-3">
                {[
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
                ].map((item, index) => (
                  <LandingReveal key={item.title} delay={index * 90}>
                    <article className="landing-feature-card h-full rounded-2xl border border-[var(--ink)]/10 bg-[var(--card)] p-6 shadow-[0_12px_30px_rgba(10,15,26,0.04)]">
                      <h3 className="text-base font-semibold tracking-tight text-[var(--ink)]">{item.title}</h3>
                      <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{item.body}</p>
                    </article>
                  </LandingReveal>
                ))}
              </div>
            </div>
          </LandingReveal>
        </div>
      </section>

      <section id="workflow" className="border-b border-[var(--line)] bg-[var(--card)]">
        <div className="landing-shell py-14 sm:py-20">
          <LandingReveal>
            <div className="max-w-2xl">
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--gold)]">Workflow</p>
              <h2 className="mt-4 font-display text-[clamp(1.75rem,4.5vw,2.5rem)] font-semibold tracking-[-0.03em] text-[var(--ink)]">
                A disciplined path from evidence to execution
              </h2>
            </div>
          </LandingReveal>

          <div className="landing-workflow mt-10 grid gap-4 sm:mt-12 sm:gap-5 md:grid-cols-2 lg:grid-cols-4">
            {workflowSteps.map((item, index) => (
              <LandingReveal key={item.step} delay={index * 100}>
                <article className="landing-workflow-step group relative h-full rounded-2xl border border-[var(--ink)]/10 bg-white p-5 shadow-[0_12px_28px_rgba(10,15,26,0.04)] sm:p-6">
                  <p className="font-mono text-sm tracking-[0.2em] text-[var(--gold)]">{item.step}</p>
                  <h3 className="mt-3 text-lg font-semibold text-[var(--ink)] sm:mt-4">{item.title}</h3>
                  <p className="mt-2 text-sm leading-7 text-[var(--muted)] sm:mt-3">{item.detail}</p>
                  {index < workflowSteps.length - 1 ? (
                    <span className="landing-workflow-connector hidden lg:block" aria-hidden="true" />
                  ) : null}
                </article>
              </LandingReveal>
            ))}
          </div>
        </div>
      </section>

      <section id="markets" className="border-b border-[var(--line)] bg-[var(--paper)]">
        <div className="landing-shell py-14 sm:py-20">
          <LandingReveal>
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--gold)]">Capital markets</p>
                <h2 className="mt-4 font-display text-3xl font-semibold tracking-[-0.03em] text-[var(--ink)] sm:text-4xl">
                  Intelligence that carries into market execution
                </h2>
                <p className="mt-5 text-base leading-7 text-[var(--muted)]">
                  The same Asset DNA that powers diligence also anchors listings, trading, settlement,
                  tokenization, collateral, and lending workflows.
                </p>
              </div>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-full border border-[var(--ink)]/15 bg-white px-5 py-3 text-sm font-medium text-[var(--ink)] transition hover:border-[var(--ink)]/30"
              >
                Explore modules
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </LandingReveal>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {platformModules.map((item, index) => {
              const Icon = item.icon;
              return (
                <LandingReveal key={item.title} delay={index * 70}>
                  <article className="landing-module-card group h-full rounded-[1.35rem] border border-[var(--ink)]/10 bg-[var(--card)] p-6 shadow-[0_12px_30px_rgba(10,15,26,0.04)]">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--gold)]/15 bg-[var(--gold-soft)] text-[var(--gold)] transition group-hover:scale-105">
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

      <section id="security" className="border-b border-[var(--line)] bg-[var(--card)]">
        <div className="landing-shell py-14 sm:py-20">
          <LandingReveal>
            <div className="grid gap-8 rounded-[1.5rem] border border-[var(--ink)]/10 bg-white p-5 shadow-[0_20px_60px_rgba(10,15,26,0.05)] sm:gap-10 sm:rounded-[2rem] sm:p-8 lg:grid-cols-[0.9fr_1.1fr] lg:p-10">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-[var(--teal)]/15 bg-[var(--teal-soft)] px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-[var(--teal)]">
                  <BadgeCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  Governance by design
                </div>
                <h2 className="mt-5 font-display text-[clamp(1.75rem,4.5vw,2rem)] font-semibold tracking-[-0.03em] text-[var(--ink)]">
                  Professional controls for regulated workflows
                </h2>
                <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
                  Role-based access, approval-based onboarding, immutable audit logs, and provenance-linked
                  intelligence give control teams confidence in every action.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  'Organization RBAC with analyst, compliance, and admin roles',
                  'Deterministic extraction with insurance-value rejection rules',
                  'Versioned Asset DNA with provenance anchors',
                  'Full activity audit across intelligence and capital markets',
                ].map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-[var(--ink)]/8 bg-[var(--paper)] px-4 py-4 text-sm leading-6 text-[var(--ink)]"
                  >
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
        <div className="landing-shell relative py-16 sm:py-24">
          <LandingReveal>
            <div className="mx-auto max-w-3xl text-center">
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--gold-soft)]">
                Ready to operate
              </p>
              <h2 className="mt-4 font-display text-[clamp(1.75rem,4.5vw,2.5rem)] font-semibold tracking-[-0.03em] text-white">
                Bring institutional discipline to private asset workflows
              </h2>
              <p className="mt-5 text-base leading-7 text-white/72">
                Start with the demo workspace, onboard your organization, and move from document review
                to portfolio and market execution on one platform.
              </p>
              <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/login"
                  className="landing-cta inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-medium text-[var(--ink)] transition hover:bg-[var(--paper)]"
                >
                  Open demo workspace
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link
                  href="/register"
                  className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/20 px-6 py-3.5 text-sm font-medium text-white transition hover:border-white/40 hover:bg-white/5"
                >
                  Create your firm
                </Link>
              </div>
            </div>
          </LandingReveal>
        </div>
      </section>

      <footer className="bg-[var(--ink)] text-white/72">
        <div className="landing-shell py-12 sm:py-14">
          <div className="landing-footer__grid grid gap-10 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-start lg:justify-between">
            <div className="landing-footer__brand min-w-0">
              <CaprovWordmark className="font-display text-lg font-semibold text-white" markClassName="text-[var(--gold)]" />
              <p className="mt-4 max-w-sm text-sm leading-7">
                AI-first private asset intelligence platform built around Asset DNA, provenance, and
                institutional control.
              </p>
            </div>
            <div className="landing-footer__links lg:text-right">
              <p className="text-[11px] uppercase tracking-[0.2em] text-white/45">Platform</p>
              <ul className="mt-4 space-y-3 text-sm">
                <li><Link href="/login" className="transition hover:text-white">Demo workspace</Link></li>
                <li><a href="#platform" className="transition hover:text-white">Capabilities</a></li>
                <li><a href="#markets" className="transition hover:text-white">Capital markets</a></li>
              </ul>
            </div>
            <div className="landing-footer__account lg:text-right">
              <p className="text-[11px] uppercase tracking-[0.2em] text-white/45">Account</p>
              <ul className="mt-4 space-y-3 text-sm">
                <li><Link href="/login" className="transition hover:text-white">Sign in</Link></li>
                <li><Link href="/register" className="transition hover:text-white">Register organization</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-12 flex flex-col gap-3 border-t border-white/10 pt-6 text-xs text-white/45 sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} CAPROV. All rights reserved.</p>
            <p className="inline-flex items-center gap-2">
              <Landmark className="h-3.5 w-3.5" aria-hidden="true" />
              Built for institutional private asset operations
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}
