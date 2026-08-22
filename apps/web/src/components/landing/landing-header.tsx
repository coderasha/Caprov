'use client';

import { CaprovWordmark } from '@/components/brand/caprov-logo';
import Link from 'next/link';
import { useEffect, useState } from 'react';

const navLinks = [
  { href: '#platform', label: 'Platform' },
  { href: '#workflow', label: 'Workflow' },
  { href: '#markets', label: 'Markets' },
  { href: '#security', label: 'Security' },
] as const;

export function LandingHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`landing-header landing-fade ${scrolled ? 'landing-header--scrolled' : ''}`}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
        <Link href="/" className="group inline-flex items-center gap-4">
          <CaprovWordmark
            className="font-display text-xl font-semibold tracking-[-0.04em] text-[var(--ink)] transition group-hover:opacity-90"
            markClassName="text-[var(--gold)]"
          />
          <span className="landing-header__tag hidden rounded-full border border-[var(--ink)]/10 bg-white/80 px-4 py-2 text-[11px] uppercase tracking-[0.24em] text-[var(--ink)]/70 lg:inline">
            Private asset intelligence
          </span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Primary">
          {navLinks.map((link) => (
            <a key={link.href} href={link.href} className="landing-header__link">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex flex-wrap items-center justify-end gap-2 rounded-full border border-[var(--ink)]/10 bg-[var(--card)]/90 p-1.5 shadow-[0_10px_24px_rgba(10,15,26,0.05)] backdrop-blur-sm sm:gap-3">
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-medium text-[var(--ink)]/72 transition hover:bg-[var(--paper-2)] hover:text-[var(--ink)]"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="landing-cta inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--ink)]/15 bg-[var(--ink)] px-4 text-sm font-medium text-white transition hover:bg-[#1a2338] sm:px-5"
          >
            Request access
          </Link>
        </div>
      </div>
    </header>
  );
}
