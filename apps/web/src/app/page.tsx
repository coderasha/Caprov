import { CaprovWordmark } from '@/components/brand/caprov-logo';
import { LandingAssetCarousel } from '@/components/landing/landing-asset-carousel';
import { LandingHeader } from '@/components/landing/landing-header';
import { LandingReveal } from '@/components/landing/landing-reveal';
import { LandingSectionHeader } from '@/components/landing/landing-section-header';
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Building2,
  Check,
  Database,
  FileSearch,
  FileText,
  Scale,
  ShieldCheck,
  Store,
  Workflow,
} from 'lucide-react';
import Link from 'next/link';

const proofPoints = [
  { label: 'Intelligence', value: 'Asset DNA from source files' },
  { label: 'Access', value: 'Fractional token interests' },
  { label: 'Credit', value: 'Collateralized facilities' },
] as const;

const partnerMarks = [
  { name: 'Aurelia', role: 'Private capital', monogram: 'A' },
  { name: 'Northstar', role: 'Institutional investor', monogram: 'N' },
  { name: 'Meridian', role: 'Asset management', monogram: 'M' },
  { name: 'Vantage', role: 'Private credit', monogram: 'V' },
  { name: 'Harbour', role: 'Real assets', monogram: 'H' },
  { name: 'Aster', role: 'Fund operations', monogram: 'A' },
] as const;

const operatingStages = [
  { label: 'Evidence', detail: 'Source files, classified and preserved' },
  { label: 'Asset DNA', detail: 'Versioned facts, marks, and risk' },
  { label: 'Markets', detail: 'Fractional interests, orders, settlement' },
  { label: 'Credit', detail: 'Collateral review and facilities' },
] as const;

const platformModules = [
  {
    icon: FileSearch,
    title: 'Intelligence engine',
    body: 'Turn source documents into reviewable facts, valuation marks, risk signals, and concise analyst briefings.',
  },
  {
    icon: Building2,
    title: 'Asset DNA',
    body: 'Maintain a traceable record of ownership, valuation, risk, timeline, and the evidence behind each field.',
  },
  {
    icon: Store,
    title: 'Marketplace & trading',
    body: 'List fractional asset-token interests, then manage orders, matching, and settlement in one controlled workflow.',
  },
  {
    icon: ShieldCheck,
    title: 'Tokenization',
    body: 'Create fractional asset-token interests with simulated or live network execution and provenance anchoring.',
  },
  {
    icon: Scale,
    title: 'Collateral & lending',
    body: 'Asset owners submit collateral while banks review documents, valuation, and risk before approving and managing facilities.',
  },
  {
    icon: Workflow,
    title: 'Audit & control',
    body: 'Apply organization roles, approval gates, and an auditable activity history across the platform.',
  },
] as const;

const workflowSteps = [
  { step: '01', title: 'Capture evidence', detail: 'Upload, classify, and preserve the source documents behind an asset.' },
  { step: '02', title: 'Establish Asset DNA', detail: 'Extract and review facts, valuation, ownership, risk, and confidence from the evidence.' },
  { step: '03', title: 'Tokenize & list', detail: 'Create fractional token interests and list them for marketplace trading and settlement.' },
  { step: '04', title: 'Finance with confidence', detail: 'Asset owners lock collateral; banks review the record and approve loans against advanceable value.' },
] as const;

const platformPillars = [
  {
    icon: FileText,
    title: 'Evidence you can inspect',
    body: 'Title, transaction, valuation, KYC, and supporting files become reviewable facts linked back to their source.',
  },
  {
    icon: Database,
    title: 'A record that evolves with the asset',
    body: 'Asset DNA keeps material changes versioned, traceable, and ready for the next decision.',
  },
  {
    icon: Workflow,
    title: 'Controls built into the workflow',
    body: 'Roles, approvals, portfolios, and audit history stay with the operating record—not in disconnected tools.',
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

          <div className="landing-shell pb-12 pt-6 sm:pb-16 sm:pt-8 lg:pb-20">
            <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-10 xl:gap-12">
              <div className="landing-fade landing-fade--delay-1 min-w-0">
                <div className="landing-hero__overline">
                  <span className="landing-hero__pulse" aria-hidden="true" />
                  Private assets. Digitized. Verified. Liquid.
                </div>
                <h1 className="landing-hero-title mt-5">
                  Intelligence for <span className="landing-hero-title__gold">private assets.</span> Built to execute.
                </h1>
                <p className="landing-lead landing-read mt-5">
                  CAPROV turns complex private-asset documents into verified digital records—then carries that evidence
                  into controlled tokenization, marketplace trading, and collateralized lending.
                </p>
                <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                  <Link href="/login" className="landing-btn landing-btn--primary group w-full sm:w-auto">
                    Explore the platform
                    <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
                  </Link>
                  <Link href="/register" className="landing-btn landing-btn--ghost w-full sm:w-auto">
                    Request access
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
                <div className="landing-hero__assurance mt-8">
                  <span>AI document intelligence</span>
                  <span>Asset tokenization</span>
                  <span>Private marketplace</span>
                  <span>Collateralized lending</span>
                </div>
              </div>

              <div className="landing-fade landing-fade--delay-2 min-w-0 w-full">
                <LandingAssetCarousel />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-partners-section landing-partners-section--hero" aria-labelledby="partner-network-title">
        <div className="landing-shell flex flex-col gap-2 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="landing-kicker">Trusted network</p>
            <h2 id="partner-network-title" className="mt-1 font-display text-base font-semibold tracking-[-0.025em] text-[var(--ink)]">Built for the teams moving private capital</h2>
          </div>
          <p className="text-xs font-medium text-[var(--muted)]">Selected partners &amp; investors</p>
        </div>
        <div className="landing-logo-marquee" tabIndex={0} aria-label="Selected partner and investor network">
          <div className="landing-logo-marquee__track">
            {[...partnerMarks, ...partnerMarks].map((partner, index) => (
              <div className="landing-logo-marquee__item" key={`${partner.name}-${index}`} aria-hidden={index >= partnerMarks.length}>
                <span className="landing-logo-marquee__mark">{partner.monogram}</span>
                <span><strong>{partner.name}</strong><small>{partner.role}</small></span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-[var(--line)]/80 bg-[var(--paper)]">
        <div className="landing-shell py-10 sm:py-12">
          <div className="landing-stats grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--line)] lg:grid-cols-4">
            {operatingStages.map((item, index) => (
              <div key={item.label} className="bg-[var(--card)] px-5 py-6 sm:px-6">
                <p className="font-mono text-[11px] tracking-[0.18em] text-[var(--gold)]">0{index + 1}</p>
                <p className="mt-3 font-display text-xl font-semibold tracking-[-0.03em] text-[var(--ink)]">{item.label}</p>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="platform" className="landing-platform-section landing-section border-b border-[var(--line)]/80">
        <div className="landing-shell">
          <LandingReveal>
            <>
              <div className="landing-platform-hero relative overflow-hidden rounded-[1.5rem] border border-white/70 px-6 py-10 sm:px-10 lg:min-h-[37rem] lg:px-12 lg:py-14">
                <div className="landing-platform-hero__image" aria-hidden="true" />
                <div className="landing-platform-hero__wash" aria-hidden="true" />
                <div className="relative z-10 max-w-[42rem]">
                  <LandingSectionHeader
                    kicker="Platform"
                    title="One operating record from document to market and credit"
                    description="CAPROV gives asset owners, investors, banks, and control teams a shared place to establish evidence, review intelligence, tokenize fractional interests, and act with appropriate controls."
                  />
                </div>
                <div className="landing-platform-pillars relative z-10 mt-10 grid gap-4 md:grid-cols-3 lg:absolute lg:inset-x-8 lg:bottom-8 lg:mt-0">
                  {platformPillars.map((item, index) => {
                    const Icon = item.icon;
                    return (
                      <LandingReveal key={item.title} delay={index * 80}>
                        <article className="landing-pillar-card h-full p-6">
                          <div className="landing-pillar-card__icon"><Icon className="h-5 w-5" /></div>
                          <h3 className="mt-5 font-display text-lg font-semibold tracking-[-0.025em] text-[var(--ink)]">{item.title}</h3>
                          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{item.body}</p>
                          <ArrowUpRight className="landing-pillar-card__arrow" aria-hidden="true" />
                        </article>
                      </LandingReveal>
                    );
                  })}
                </div>
              </div>
            </>
          </LandingReveal>
        </div>
      </section>

      <section id="workflow" className="landing-workflow-section landing-section border-b border-[var(--line)]/80">
        <div className="landing-shell">
          <LandingReveal>
            <LandingSectionHeader
              kicker="Workflow"
              title="From source document to fractional market access and lending"
            />
          </LandingReveal>

          <div className="landing-workflow mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {workflowSteps.map((item, index) => (
              <LandingReveal key={item.step} delay={index * 90}>
                <article className="landing-workflow-card landing-workflow-step relative h-full p-6">
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

      <section id="markets" className="landing-markets-section landing-section border-b border-[var(--line)]/80">
        <div className="landing-shell">
          <LandingReveal>
            <div className="landing-markets-panel overflow-hidden rounded-[1.5rem] p-6 sm:p-10">
              <LandingSectionHeader
                kicker="Capital markets"
                title="Turn validated intelligence into fractional access and credit"
                description="Once Asset DNA is reviewed, owners can tokenize and list fractional interests. The same documents, valuation, and risk context support collateral review and bank-approved lending."
                action={<Link href="/login" className="landing-btn landing-btn--light w-full sm:w-auto">Explore the workspace <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>}
              />
              <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {platformModules.map((item, index) => {
              const Icon = item.icon;
              return (
                <LandingReveal key={item.title} delay={index * 60}>
                  <article className="landing-market-module landing-module-card group h-full p-6">
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
          </LandingReveal>
          </div>
      </section>

      <section id="security" className="landing-security-section landing-section border-b border-[var(--line)]/80">
        <div className="landing-shell">
          <LandingReveal>
            <div className="landing-security-panel grid gap-8 p-6 sm:p-8 lg:grid-cols-[0.85fr_1.15fr] lg:p-10">
              <div>
                <div className="landing-badge landing-badge--teal inline-flex items-center gap-2">
                  <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  Governance by design
                </div>
                <h2 className="landing-title mt-6">Controls that belong with the asset record</h2>
                <p className="landing-lead mt-4 max-w-md">
                  Role-based access, approval-gated onboarding, versioned records, and traceable source evidence help teams review material activity with confidence.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  'Role-aware workflows for analysts, compliance, and administrators',
                  'Extraction rules that separate market marks from non-market values',
                  'Versioned Asset DNA with source and provenance references',
                  'Activity history across intelligence and capital-markets workflows',
                ].map((item) => (
                  <div key={item} className="landing-security-check rounded-xl px-4 py-4 text-sm leading-6 text-[var(--ink)]">
                    <Check className="h-4 w-4 shrink-0 text-[var(--gold)]" aria-hidden="true" />{item}
                  </div>
                ))}
              </div>
            </div>
          </LandingReveal>
        </div>
      </section>

      <section className="landing-cta-band">
        <div className="landing-cta-band__glow" aria-hidden="true" />
        <div className="landing-shell landing-section relative">
          <LandingReveal>
            <div className="mx-auto max-w-2xl text-center">
              <p className="landing-kicker">A better operating record starts here</p>
              <h2 className="landing-title mt-4">Bring clarity to every private asset decision</h2>
              <p className="landing-cta-band__copy mx-auto mt-5 max-w-lg text-base leading-7">
                Open the workspace or request an organization. Evidence becomes Asset DNA, and that record supports markets and credit.
              </p>
              <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                <Link href="/login" className="landing-btn landing-btn--light group w-full sm:w-auto">
                  Explore the workspace
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
                <Link href="/register" className="landing-btn landing-btn--outline-light w-full sm:w-auto">
                  Request access
                </Link>
              </div>
            </div>
          </LandingReveal>
        </div>
      </section>

      <footer id="company" className="landing-footer">
        <div className="landing-footer__glow" aria-hidden="true" />
        <div className="landing-shell landing-footer__inner">
          <div className="landing-footer__top">
            <div className="landing-footer__brand">
              <CaprovWordmark
                tone="dark"
                variant="full"
                className="landing-footer__logo"
              />
              <p className="landing-footer__tagline">
                Evidence, markets, and credit on one private-asset record.
              </p>
            </div>
            <nav className="landing-footer__nav" aria-label="Footer">
              <div className="landing-footer__col">
                <p className="landing-footer__label">Platform</p>
                <ul>
                  <li><Link href="/login">Demo workspace</Link></li>
                  <li><a href="#platform">Capabilities</a></li>
                  <li><a href="#markets">Capital markets</a></li>
                </ul>
              </div>
              <div className="landing-footer__col">
                <p className="landing-footer__label">Account</p>
                <ul>
                  <li><Link href="/login">Sign in</Link></li>
                  <li><Link href="/register">Register organization</Link></li>
                </ul>
              </div>
            </nav>
          </div>
          <div className="landing-footer__bottom">
            <p>© {new Date().getFullYear()} CAPROV</p>
            <p className="landing-footer__bottom-note">Evidence-led private asset operations</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
