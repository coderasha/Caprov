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
    const onScroll = () => setScrolled(window.scrollY > 8);
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
      <header className={cn('landing-header landing-fade', scrolled && 'landing-header--scrolled')}>
        <div className="landing-header-bar">
          <div className="landing-header__inner">
            <Link href="/" className="landing-header__brand group min-w-0">
              <CaprovWordmark
                className="font-display text-lg font-semibold tracking-[-0.04em] text-[var(--ink)] transition group-hover:opacity-85 sm:text-xl"
                markClassName="text-[var(--gold)]"
              />
              <p className="landing-header__tagline mt-1 hidden text-[10px] uppercase tracking-[0.22em] text-[var(--muted)] sm:block">
                Evidence-led private asset operations
              </p>
            </Link>

            <nav className="landing-header__nav hidden items-center gap-7 xl:flex" aria-label="Primary">
              {navLinks.map((link) => (
                <a key={link.href} href={link.href} className="landing-header__link">
                  {link.label}
                </a>
              ))}
            </nav>

            <div className="landing-header__actions">
              <div className="landing-header__auth hidden items-center gap-2 sm:flex">
                <Link href="/login" className="landing-header__signin">
                  Sign in
                </Link>
                <Link href="/register" className="landing-btn landing-btn--primary landing-btn--compact">
                  Request access
                </Link>
              </div>

              <button
                type="button"
                className="landing-icon-btn xl:hidden"
                aria-expanded={menuOpen}
                aria-controls="landing-mobile-menu"
                aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                onClick={() => setMenuOpen((open) => !open)}
              >
                {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
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
        <button type="button" className="landing-mobile-menu__backdrop" aria-label="Close menu" onClick={closeMenu} />
        <div className="landing-mobile-menu__panel">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
            <CaprovWordmark className="font-display text-lg font-semibold text-[var(--ink)]" markClassName="text-[var(--gold)]" />
            <button type="button" className="landing-icon-btn" aria-label="Close menu" onClick={closeMenu}>
              <X className="h-4 w-4" />
            </button>
          </div>

          <nav className="px-5 py-6" aria-label="Mobile">
            <ul className="space-y-1">
              {navLinks.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className="landing-mobile-menu__link" onClick={closeMenu}>
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="mt-auto space-y-3 border-t border-[var(--line)] px-5 py-5">
            <Link href="/login" className="landing-btn landing-btn--ghost w-full" onClick={closeMenu}>
              Sign in
            </Link>
            <Link href="/register" className="landing-btn landing-btn--primary w-full" onClick={closeMenu}>
              Request access
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
