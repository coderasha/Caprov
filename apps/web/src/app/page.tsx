import { CaprovWordmark } from '@/components/brand/caprov-logo';
import Link from 'next/link';

const proofPoints = [
  { label: 'Asset review', value: 'Document-backed diligence' },
  { label: 'Operating record', value: 'Versioned Asset DNA' },
  { label: 'Execution layer', value: 'Portfolio to lending' },
] as const;

const capabilityRows = [
  {
    title: 'Evidence intake',
    body: 'Bring valuation packs, title documents, agreements, KYC files, and supporting reports into one governed workspace.',
  },
  {
    title: 'Structured review',
    body: 'Turn source material into extracted facts, valuation context, risk signals, and provenance-linked intelligence.',
  },
  {
    title: 'Institutional workflows',
    body: 'Carry the same trusted record into portfolios, listings, tokenization, collateral, financing, and audit.',
  },
] as const;

const productSignals = [
  'Approval-based organization onboarding',
  'Provenance anchors and version history',
  'Structured extraction for review teams',
  'Portfolio, collateral, and lending coverage',
] as const;

export default function Home() {
  return (
    <main className="min-h-screen bg-[var(--paper)] text-[var(--text)]">
      <section className="landing-hero relative isolate overflow-hidden border-b border-[var(--line)]">
        <div className="landing-hero__backdrop" aria-hidden="true" />
        <div className="landing-hero__mesh" aria-hidden="true" />
        <div className="landing-hero__halo landing-hero__halo--one" aria-hidden="true" />
        <div className="landing-hero__halo landing-hero__halo--two" aria-hidden="true" />

        <div className="relative z-10 w-full px-6 sm:px-10">
          <header className="landing-fade py-5 sm:py-6">
            <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <CaprovWordmark
                  className="font-display text-xl font-semibold tracking-[-0.04em] text-[var(--ink)]"
                  markClassName="text-[var(--gold)]"
                />
                <div className="hidden rounded-full border border-[var(--ink)]/10 bg-white px-4 py-2 text-[11px] uppercase tracking-[0.24em] text-[var(--ink)]/70 shadow-[0_10px_24px_rgba(10,15,26,0.05)] lg:block">
                  Private asset intelligence platform
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 rounded-full border border-[var(--ink)]/10 bg-[var(--card)] p-1.5 shadow-[0_10px_24px_rgba(10,15,26,0.05)] sm:gap-3">
                <Link
                  href="/login"
                  className="inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-medium text-[var(--ink)]/72 transition hover:bg-[var(--paper-2)] hover:text-[var(--ink)]"
                >
                  Sign in
                </Link>
                <Link
                  href="/register"
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--ink)]/15 bg-white px-4 text-sm font-medium text-[var(--ink)] transition hover:bg-[var(--paper)] sm:px-5"
                >
                  Start an organization
                </Link>
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-6xl pb-16 pt-8 sm:pb-20 sm:pt-10">
            <div className="grid items-stretch gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)] lg:gap-14">
              <div className="landing-fade landing-fade--delay-1 flex flex-col justify-center">
                <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--gold)]/18 bg-[var(--gold-soft)] px-3 py-1.5 text-[11px] uppercase tracking-[0.22em] text-[var(--gold)]">
                  Trusted operating record
                </div>
                <h1 className="mt-6 max-w-4xl text-[clamp(3rem,6.2vw,5.6rem)] font-semibold leading-[0.98] tracking-[-0.05em] text-[var(--ink)]">
                  A professional platform for private asset review, control, and execution.
                </h1>
                <p className="mt-6 max-w-2xl text-base leading-7 text-[var(--ink)]/74 sm:text-lg sm:leading-8">
                  CAPROV gives investment, operations, and control teams a disciplined way to turn
                  source documents into structured intelligence that holds up across diligence,
                  portfolio oversight, financing, and market workflows.
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
                    className="rounded-full border border-[var(--ink)]/18 bg-white px-6 py-3.5 text-sm font-medium text-[var(--ink)] transition hover:border-[var(--ink)]/36"
                  >
                    Create your firm
                  </Link>
                </div>
                <div className="mt-10 grid gap-4 sm:grid-cols-3">
                  {proofPoints.map((item) => (
                    <div
                      key={item.label}
                      className="landing-proof rounded-2xl border border-[var(--ink)]/10 bg-white p-5 shadow-[0_12px_28px_rgba(10,15,26,0.04)]"
                    >
                      <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">{item.label}</p>
                      <p className="mt-2 text-sm font-medium text-[var(--ink)]">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="landing-fade landing-fade--delay-2 flex">
                <div className="landing-console flex w-full flex-col rounded-[1.75rem] border border-[var(--ink)]/10 bg-[var(--card)] p-6 shadow-[0_26px_60px_rgba(10,15,26,0.10)] sm:p-7">
                  <div className="flex items-start justify-between gap-4 border-b border-[var(--ink)]/10 pb-5">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--gold)]">Operating model</p>
                      <h2 className="mt-2 max-w-sm text-xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
                        From source documents to controlled execution
                      </h2>
                    </div>
                    <div className="rounded-full border border-[var(--ok)]/16 bg-[var(--ok-soft)] px-3 py-1.5 text-xs font-medium text-[var(--ok)]">
                      Institutional
                    </div>
                  </div>

                  <div className="mt-6 grid gap-3">
                    {capabilityRows.map((item, index) => (
                      <article
                        key={item.title}
                        className="landing-step rounded-2xl border border-[var(--ink)]/8 bg-white p-5"
                        style={{ animationDelay: `${0.18 + index * 0.12}s` }}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--gold)]/15 bg-[var(--gold-soft)] text-sm font-semibold text-[var(--gold)]">
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

                  <div className="mt-6 rounded-2xl border border-[var(--ink)]/8 bg-[var(--paper)] p-5">
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

                  <div className="mt-6 grid gap-4 border-t border-[var(--ink)]/10 pt-6 sm:grid-cols-3">
                    {[
                      { value: '1', label: 'shared source of record' },
                      { value: '3', label: 'core workflow stages' },
                      { value: '24/7', label: 'operating visibility' },
                    ].map((metric) => (
                      <div key={metric.label} className="rounded-xl border border-[var(--ink)]/8 bg-white px-4 py-4">
                        <p className="text-2xl font-semibold tracking-[-0.04em] text-[var(--ink)]">{metric.value}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[var(--muted)]">{metric.label}</p>
                      </div>
                    ))}
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
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-[var(--ink)] sm:text-4xl">
                Built for teams that need clarity before they move capital
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
                <article
                  key={item.title}
                  className="landing-feature-card rounded-2xl border border-[var(--ink)]/10 bg-[var(--card)] p-6 shadow-[0_12px_30px_rgba(10,15,26,0.04)]"
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

          <div className="mt-16 grid gap-4 rounded-[2rem] border border-[var(--ink)]/10 bg-[var(--card)] p-6 shadow-[0_20px_60px_rgba(10,15,26,0.05)] sm:grid-cols-3 sm:p-8">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">Professional by default</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
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
