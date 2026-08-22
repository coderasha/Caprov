'use client';

import { CaprovWordmark } from '@/components/brand/caprov-logo';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import {
  Activity,
  ArrowLeftRight,
  Building2,
  ChevronRight,
  FileStack,
  FolderKanban,
  HandCoins,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  Scale,
  Shield,
  Sparkles,
  Store,
  Wallet,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

const navSections = [
  {
    title: 'Start here',
    items: [
      { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
      { href: '/assets', label: 'Assets', icon: Building2 },
      { href: '/documents', label: 'Documents', icon: FileStack },
      { href: '/intelligence', label: 'Asset DNA', icon: Sparkles },
      { href: '/intelligence/copilot', label: 'Ask AI', icon: MessageSquareText },
    ],
  },
  {
    title: 'Portfolio and execution',
    items: [
      { href: '/portfolios', label: 'Portfolios', icon: Wallet },
      { href: '/marketplace', label: 'Listings', icon: Store },
      { href: '/trading', label: 'Orders', icon: ArrowLeftRight },
      { href: '/settlement', label: 'Settlement', icon: Scale },
      { href: '/tokenization', label: 'Tokens', icon: Shield },
      { href: '/collateral', label: 'Collateral', icon: HandCoins },
      { href: '/lending', label: 'Loans', icon: Landmark },
    ],
  },
  {
    title: 'Workspace',
    items: [
      { href: '/organization', label: 'Organization', icon: FolderKanban },
      { href: '/audit', label: 'Audit', icon: Activity },
    ],
  },
] as const;

const platformAdminNav = { href: '/platform-admin', label: 'Platform admin', icon: Shield } as const;

function isActivePath(pathname: string, href: string) {
  if (href === '/intelligence') {
    return pathname === '/intelligence' || pathname.startsWith('/intelligence/dna');
  }
  if (href === '/intelligence/copilot') {
    return pathname.startsWith('/intelligence/copilot');
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarContent({
  pathname,
  onNavigate,
  onClose,
  showClose,
}: {
  pathname: string;
  onNavigate?: () => void;
  onClose?: () => void;
  showClose?: boolean;
}) {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const organization = useAuthStore((state) => state.organization);
  const roles = useAuthStore((state) => state.roles);
  const logout = useAuthStore((state) => state.logout);

  const sections = useMemo(() => {
    if (!roles.includes('PLATFORM_ADMIN')) {
      return navSections;
    }
    return [
      {
        title: 'Platform',
        items: [platformAdminNav],
      },
      ...navSections,
    ];
  }, [roles]);

  return (
    <div className="flex h-full min-h-0 flex-col px-4 py-5 sm:px-5 sm:py-7">
      <div className="flex items-start justify-between gap-3 px-2">
        <Link href="/dashboard" className="min-w-0" onClick={onNavigate}>
          <CaprovWordmark
            className="font-display text-[1.35rem] font-semibold tracking-[-0.04em] text-white"
            markClassName="text-[var(--gold)]"
          />
          <p className="mt-2 text-[12px] leading-5 text-white/45">Private-asset intelligence</p>
        </Link>
        {showClose ? (
          <button
            type="button"
            className="rounded-xl p-2 text-white/55 transition hover:bg-white/[0.06] hover:text-white"
            aria-label="Close navigation"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        ) : null}
      </div>

      <nav className="mt-8 flex-1 overflow-y-auto overscroll-contain pb-4 [scrollbar-width:thin]">
        <div className="space-y-5">
          {sections.map((section) => (
            <div key={section.title}>
              <p className="px-3 text-[10px] uppercase tracking-[0.22em] text-white/30">{section.title}</p>
              <div className="mt-2 grid gap-1">
                {section.items.map((item) => {
                  const active = isActivePath(pathname, item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      data-active={active}
                      onClick={onNavigate}
                      className={cn(
                        'platform-nav-link flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] text-white/55 transition hover:bg-white/[0.06] hover:text-white',
                        active && 'bg-white/[0.08] font-medium text-white',
                      )}
                    >
                      <Icon
                        size={15}
                        strokeWidth={1.75}
                        className={active ? 'text-[var(--gold)]' : undefined}
                      />
                      <span className="flex-1">{item.label}</span>
                      {active ? <ChevronRight size={14} className="text-[var(--gold)]" /> : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>

      <div className="mt-auto border-t border-white/10 pt-5">
        <p className="truncate px-2 text-[13px] font-medium text-white/90">{organization?.name}</p>
        <p className="mt-1 truncate px-2 text-[12px] text-white/40">{user?.fullName}</p>
        <button
          type="button"
          onClick={() => {
            logout();
            router.push('/login');
          }}
          className="mt-4 inline-flex items-center gap-2 rounded-xl px-2 py-2 text-[12px] text-white/45 transition hover:bg-white/[0.06] hover:text-white"
        >
          <LogOut size={14} />
          Sign out
        </button>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (!token) router.replace('/login');
  }, [token, router]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNavOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [navOpen]);

  if (!token) {
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--paper)] px-4 text-sm text-[var(--muted)]">
        Opening CAPROV…
      </div>
    );
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[272px_minmax(0,1fr)]">
      <aside className="platform-sidebar hidden text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <SidebarContent pathname={pathname} />
      </aside>

      <div
        className={cn(
          'fixed inset-0 z-40 lg:hidden',
          navOpen ? 'pointer-events-auto' : 'pointer-events-none',
        )}
        aria-hidden={!navOpen}
      >
        <button
          type="button"
          tabIndex={navOpen ? 0 : -1}
          className={cn(
            'absolute inset-0 bg-[var(--ink)]/55 backdrop-blur-[2px] transition-opacity duration-200',
            navOpen ? 'opacity-100' : 'opacity-0',
          )}
          aria-label="Dismiss navigation"
          onClick={() => setNavOpen(false)}
        />
        <aside
          className={cn(
            'platform-sidebar absolute inset-y-0 left-0 flex w-[min(100%,20rem)] max-w-[85vw] flex-col text-white shadow-2xl transition-transform duration-200 ease-out',
            navOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          {navOpen ? (
            <SidebarContent
              pathname={pathname}
              showClose
              onClose={() => setNavOpen(false)}
              onNavigate={() => setNavOpen(false)}
            />
          ) : null}
        </aside>
      </div>

      <div className="platform-canvas min-w-0">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-[var(--line)]/80 bg-[color-mix(in_srgb,var(--paper)_78%,transparent)] px-4 py-3 backdrop-blur-md sm:px-6 sm:py-4 lg:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--card)] text-[var(--ink)] transition hover:border-[var(--ink)]/25 lg:hidden"
              aria-label="Open navigation"
              aria-expanded={navOpen}
              onClick={() => setNavOpen(true)}
            >
              <Menu size={18} />
            </button>
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--muted)]">
                Operator console
              </p>
              <p className="mt-0.5 truncate text-sm font-medium text-[var(--ink)] sm:mt-1">
                {user?.title ?? 'Analyst workspace'}
              </p>
            </div>
          </div>
          <div className="hidden rounded-xl border border-[var(--line)] bg-[var(--card)]/90 px-3.5 py-2 text-[11px] uppercase tracking-[0.16em] text-[var(--muted)] sm:block">
            Collect → Review → Act
          </div>
        </header>
        <main className="px-4 py-6 sm:px-6 sm:py-9 lg:px-10 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
