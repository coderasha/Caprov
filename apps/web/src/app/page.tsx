import { CaprovWordmark } from '@/components/brand/caprov-logo';
import Link from 'next/link';

const proofPoints = [
  { label: 'Versioned intelligence', value: 'Asset DNA snapshots' },
  { label: 'Document extraction', value: 'PDF and DOCX ready' },
  { label: 'Trusted workflows', value: 'Valuation, risk, lending' },
] as const;

const capabilityRows = [
  {
    title: 'Collect the evidence',
    body: 'Upload title packs, valuation memos, agreements, KYC files, and supporting reports into a single review flow.',
  },
  {
    title: 'Review the extracted truth',
    body: 'CAPROV turns source files into structured facts, valuation context, risk signals, and provenance-linked Asset DNA.',
  },
  {
    title: 'Move into action',
    body: 'Use the same trusted intelligence across portfolios, listings, tokenization, collateral, loans, and audit.',
  },
] as const;

const productSignals = [
  'Approval-gated organization onboarding',
  'Versioned Asset DNA with provenance anchors',
  'Structured extraction tables for property review',
  'Portfolio, collateral, and lending workflows',
] as const;

export default function Home() {
  return (
    <main className="min-h-screen bg-[var(--paper)] text-[var(--text)]">
      <section className="landing-hero relative isolate min-h-[100svh] overflow-hidden">
        <div className="landing-hero__plane" aria-hidden="true" />
        <div className="landing-hero__veil" aria-hidden="true" />
        <div className="landing-hero__grid" aria-hidden="true" />
        <div className="landing-hero__orb landing-hero__orb--one" aria-hidden="true" />
        <div className="landing-hero__orb landing-hero__orb--two" aria-hidden="true" />

        <div className="relative z-10 flex min-h-[100svh] w-full flex-col px-6 sm:px-10">
          <header className="landing-fade pt-4 sm:pt-5">
            <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
              <div className="rounded-full border border-white/45 bg-white/40 px-4 py-2 text-[11px] uppercase tracking-[0.24em] text-[var(--ink)]/70 shadow-[0_10px_30px_rgba(10,15,26,0.08)] backdrop-blur-md">
                Private asset operating intelligence
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 rounded-full border border-white/45 bg-white/48 p-1.5 shadow-[0_10px_30px_rgba(10,15,26,0.08)] backdrop-blur-md sm:gap-3">
                <Link
                  href="/login"
                  className="inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-medium text-[var(--ink)]/72 transition hover:bg-white/55 hover:text-[var(--ink)]"
                >
                  Sign in
                </Link>
                <Link
                  href="/register"
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--ink)]/15 bg-white/78 px-4 text-sm font-medium text-[var(--ink)] shadow-[0_1px_0_rgba(255,255,255,0.55)_inset] transition hover:bg-white sm:px-5"
                >
                  Start an organization
                </Link>
              </div>
            </div>
          </header>

          <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center pb-16 pt-10 sm:pb-20">
            <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="landing-fade landing-fade--delay-1 max-w-4xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-[var(--ink)]/10 bg-white/60 px-3 py-1.5 text-[11px] uppercase tracking-[0.22em] text-[var(--gold)] shadow-[0_10px_30px_rgba(10,15,26,0.05)] backdrop-blur-sm">
                  Versioned intelligence layer
                </div>
                <h1 className="mt-6 font-display text-[clamp(3.4rem,12vw,8.5rem)] font-semibold leading-[0.88] tracking-[-0.05em] text-[var(--ink)]">
                  <CaprovWordmark className="gap-[0.28em]" markClassName="text-[var(--gold)]" />
                </h1>
                <p className="mt-5 max-w-3xl font-display text-[clamp(1.5rem,3.6vw,3rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-[var(--ink)] sm:mt-7">
                  A professional operating layer for document-heavy private assets.
                </p>
                <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--ink)]/72 sm:mt-6 sm:text-lg sm:leading-8">
                  Turn ownership paperwork, valuations, and supporting reports into structured Asset DNA
                  your team can review, trust, and use across portfolio, financing, and market workflows.
                </p>
                <div className="mt-8 flex flex-wrap gap-3 sm:mt-10">
                  <Link
                    href="/login"
                    className="landing-cta rounded-full bg-[var(--ink)] px-6 py-3.5 text-sm font-medium text-white transition hover:bg-[#1a2338]"
                  >
                    Open the demo workspace
                  </Link>
                  <Link
                    href="/register"
                    className="rounded-full border border-[var(--ink)]/20 bg-white/80 px-6 py-3.5 text-sm font-medium text-[var(--ink)] backdrop-blur-sm transition hover:border-[var(--ink)]/40"
                  >
                    Create your firm
                  </Link>
                </div>
                <div className="mt-8 grid gap-4 sm:grid-cols-3">
                  {proofPoints.map((item) => (
                    <div key={item.label} className="landing-proof rounded-2xl border border-white/60 bg-white/55 p-4 backdrop-blur-sm">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">{item.label}</p>
                      <p className="mt-2 text-sm font-medium text-[var(--ink)]">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="landing-fade landing-fade--delay-2">
                <div className="landing-console rounded-[2rem] border border-white/55 bg-[rgba(255,255,255,0.58)] p-5 shadow-[0_30px_80px_rgba(10,15,26,0.16)] backdrop-blur-xl sm:p-6">
                  <div className="flex items-center justify-between gap-4 border-b border-[var(--ink)]/10 pb-4">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--gold)]">Live workflow</p>
                      <h2 className="mt-2 font-display text-xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
                        From evidence to decision
                      </h2>
                    </div>
                    <div className="rounded-full border border-[var(--ink)]/10 bg-white/70 px-3 py-1.5 text-xs font-medium text-[var(--ink)]">
                      Trusted
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3">
                    {capabilityRows.map((item, index) => (
                      <article
                        key={item.title}
                        className="landing-step rounded-2xl border border-[var(--ink)]/8 bg-white/72 p-4"
                        style={{ animationDelay: `${0.18 + index * 0.12}s` }}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--gold-soft)] text-sm font-semibold text-[var(--gold)]">
                            {index + 1}
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-[var(--ink)]">{item.title}</h3>
                            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{item.body}</p>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>

                  <div className="mt-5 rounded-2xl border border-[var(--ink)]/8 bg-[linear-gradient(135deg,rgba(15,111,104,0.08),rgba(157,107,36,0.12))] p-4">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--muted)]">Platform signals</p>
                    <div className="mt-3 grid gap-2">
                      {productSignals.map((signal) => (
                        <div key={signal} className="flex items-center gap-3 text-sm text-[var(--ink)]">
                          <span className="h-2 w-2 rounded-full bg-[var(--gold)]" />
                          {signal}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-[var(--line)] bg-[var(--paper)]">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:px-10">
          <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--gold)]">
                Platform
              </p>
              <h2 className="mt-4 font-display text-3xl font-semibold tracking-[-0.03em] text-[var(--ink)] sm:text-4xl">
                Built for teams that need clarity before action
              </h2>
              <p className="mt-5 max-w-md text-base leading-7 text-[var(--muted)]">
                CAPROV gives investment, operations, and control teams a shared workflow for turning
                fragmented source material into usable intelligence.
              </p>
            </div>
            <div className="grid gap-6 sm:grid-cols-3 sm:gap-8">
              {[
                {
                  title: 'Documents to facts',
                  body: 'Title, SPA, valuation, KYC and insurance packs become provenance-linked facts.',
                },
                {
                  title: 'Asset DNA',
                  body: 'A versioned intelligence envelope for ownership, timeline, valuation and risk.',
                },
                {
                  title: 'Operator control',
                  body: 'Organizations, approvals, portfolios and audit stay in the core business platform.',
                },
              ].map((item, index) => (
                <article
                  key={item.title}
                  className="landing-feature-card border-t border-[var(--ink)]/15 pt-5"
                  style={{ animationDelay: `${0.15 + index * 0.08}s` }}
                >
                  <h3 className="text-base font-semibold tracking-tight text-[var(--ink)]">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{item.body}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="mt-16 grid gap-4 rounded-[2rem] border border-[var(--ink)]/10 bg-[var(--card)]/78 p-6 shadow-[0_20px_60px_rgba(10,15,26,0.05)] sm:grid-cols-3 sm:p-8">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">Professional by default</p>
              <p className="mt-3 font-display text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
                Clear workflows
              </p>
            </div>
            <p className="text-sm leading-7 text-[var(--muted)]">
              The product is organized around how teams actually work: set up the asset, add evidence,
              review the intelligence, and only then move into execution workflows.
            </p>
            <div className="flex items-center sm:justify-end">
              <Link
                href="/login"
                className="rounded-full border border-[var(--ink)]/15 bg-white px-5 py-3 text-sm font-medium text-[var(--ink)] transition hover:border-[var(--ink)]/30"
              >
                Explore the platform
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
