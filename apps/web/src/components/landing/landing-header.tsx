'use client';

import { CaprovWordmark } from '@/components/brand/caprov-logo';
import { cn } from '@/lib/utils';
import { Menu, X } from 'lucide-react';
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
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <>
      <header
        className={cn(
          'landing-header landing-fade',
          scrolled && 'landing-header--scrolled',
        )}
      >
        <div className="landing-header-bar">
          <div className="landing-header__inner">
            <Link href="/" className="landing-header__brand group min-w-0">
              <CaprovWordmark
                className="font-display text-lg font-semibold tracking-[-0.04em] text-[var(--ink)] transition group-hover:opacity-90 sm:text-xl"
                markClassName="text-[var(--gold)]"
              />
              <p className="landing-header__tagline mt-1.5 hidden text-[10px] uppercase tracking-[0.22em] text-[var(--ink)]/58 sm:block sm:text-[11px] sm:tracking-[0.24em]">
                Private asset intelligence
              </p>
            </Link>

            <nav className="landing-header__nav hidden items-center gap-8 xl:flex" aria-label="Primary">
              {navLinks.map((link) => (
                <a key={link.href} href={link.href} className="landing-header__link">
                  {link.label}
                </a>
              ))}
            </nav>

            <div className="landing-header__actions">
              <div className="landing-header__auth hidden text-right sm:block">
                <div className="flex items-center justify-end gap-2 rounded-full border border-[var(--ink)]/10 bg-[var(--card)]/90 p-1.5 shadow-[0_10px_24px_rgba(10,15,26,0.05)] backdrop-blur-sm sm:gap-3">
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
                <p className="landing-header__auth-note mt-2 hidden text-[10px] uppercase tracking-[0.18em] text-[var(--muted)] md:block">
                  Demo workspace · Organization onboarding
                </p>
              </div>

              <button
                type="button"
                className="landing-mobile-toggle caprov-touch-target inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--ink)]/10 bg-[var(--card)] text-[var(--ink)] shadow-[0_8px_20px_rgba(10,15,26,0.05)] xl:hidden"
                aria-expanded={menuOpen}
                aria-controls="landing-mobile-menu"
                aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                onClick={() => setMenuOpen((open) => !open)}
              >
                {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div
        id="landing-mobile-menu"
        className={cn('landing-mobile-menu xl:hidden', menuOpen && 'landing-mobile-menu--open')}
        aria-hidden={!menuOpen}
      >
        <button
          type="button"
          className="landing-mobile-menu__backdrop"
          aria-label="Close menu"
          onClick={closeMenu}
        />
        <div className="landing-mobile-menu__panel">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
            <CaprovWordmark
              className="font-display text-lg font-semibold text-[var(--ink)]"
              markClassName="text-[var(--gold)]"
            />
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--ink)]/10 bg-[var(--paper)] text-[var(--ink)]"
              aria-label="Close menu"
              onClick={closeMenu}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className="px-5 py-6" aria-label="Mobile">
            <ul className="space-y-1">
              {navLinks.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="landing-mobile-menu__link"
                    onClick={closeMenu}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="mt-auto space-y-3 border-t border-[var(--line)] px-5 py-5">
            <Link
              href="/login"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[var(--ink)]/12 bg-white px-4 text-sm font-medium text-[var(--ink)]"
              onClick={closeMenu}
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="landing-cta inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[var(--ink)] px-4 text-sm font-medium text-white"
              onClick={closeMenu}
            >
              Request access
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
