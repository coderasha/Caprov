'use client';

import { BuyerDashboard } from '@/components/dashboard/buyer-dashboard';
import { OrgAdminDashboard } from '@/components/dashboard/org-admin-dashboard';
import { PageHeader } from '@/components/layout/page-header';
import { useWallet } from '@/components/wallet/wallet-provider';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { useAuthStore } from '@/stores/auth-store';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

function isBankerOnly(roles: string[]) {
  return roles.includes('BANKER') && !roles.some((role) => ['ORG_ADMIN', 'ANALYST', 'PLATFORM_ADMIN', 'BUYER'].includes(role));
}

export default function DashboardPage() {
  const { network } = useWallet();
  const roles = useAuthStore((state) => state.roles);
  const bankerOnly = isBankerOnly(roles);
  const isBuyer =
    roles.includes('BUYER') &&
    !roles.some((role) => ['ORG_ADMIN', 'ANALYST', 'PLATFORM_ADMIN', 'BANKER'].includes(role));

  const collateralQuery = useQuery({
    queryKey: ['collateral'],
    queryFn: async () =>
      (await api.get<Array<{ id: string; status: string; asset?: { name: string } | null }>>('/collateral')).data,
    enabled: bankerOnly,
  });
  const loansQuery = useQuery({
    queryKey: ['lending'],
    queryFn: async () =>
      (
        await api.get<
          Array<{ id: string; status: string; principal: number; currency: string; asset?: { name: string } | null }>
        >('/lending')
      ).data,
    enabled: bankerOnly,
  });

  if (isBuyer) {
    return <BuyerDashboard />;
  }

  if (bankerOnly) {
    const collateral = collateralQuery.data ?? [];
    const loans = loansQuery.data ?? [];
    const awaitingReview = collateral.filter((item) => item.status === 'PENDING_APPROVAL');
    const awaitingDisbursal = loans.filter((item) => item.status === 'ACCEPTED');
    return (
      <div className="mx-auto max-w-6xl space-y-8">
        <PageHeader
          eyebrow="Credit desk"
          title="Collateral and lending oversight"
          description={`Review collateral submitted on ${network.chainName}, structure facilities, and authorize disbursal from the bank treasury.`}
          actions={
            <Link href="/lending">
              <Button>Open loan desk</Button>
            </Link>
          }
        />
        <section className="grid gap-4 md:grid-cols-3">
          {[
            { label: 'Collateral to review', value: awaitingReview.length, hint: 'Awaiting underwriting' },
            { label: 'Facilities to disburse', value: awaitingDisbursal.length, hint: 'Accepted by asset owners' },
            {
              label: 'Active facilities',
              value: loans.filter((item) => item.status === 'ACTIVE').length,
              hint: 'Outstanding bank exposure',
            },
          ].map((item) => (
            <Card key={item.label} className="p-5">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">{item.label}</p>
              <p className="mt-4 font-display text-3xl font-semibold">{item.value}</p>
              <p className="mt-2 text-xs text-[var(--muted)]">{item.hint}</p>
            </Card>
          ))}
        </section>
        <section className="grid gap-5 lg:grid-cols-2">
          <Card className="p-6">
            <h2 className="font-display text-lg font-semibold">Review queue</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">Only collateralized asset records are available to the bank.</p>
            <div className="mt-4 grid gap-3">
              {awaitingReview.length ? (
                awaitingReview.map((item) => (
                  <div key={item.id} className="rounded-xl border border-[var(--line)] px-4 py-3">
                    <p className="font-medium">{item.asset?.name ?? item.id}</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">Collateral submitted for review</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[var(--muted)]">No collateral is awaiting review.</p>
              )}
            </div>
            <Link href="/collateral" className="mt-5 inline-flex text-sm font-medium underline underline-offset-4">
              Review collateral
            </Link>
          </Card>
          <Card className="p-6">
            <h2 className="font-display text-lg font-semibold">Disbursal queue</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Accepted facilities need a vault activation before simulated USD is released.
            </p>
            <div className="mt-4 grid gap-3">
              {awaitingDisbursal.length ? (
                awaitingDisbursal.map((item) => (
                  <div key={item.id} className="rounded-xl border border-[var(--line)] px-4 py-3">
                    <p className="font-medium">{item.asset?.name ?? item.id}</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {money(item.principal, item.currency)} · ready to disburse
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[var(--muted)]">No accepted facilities are awaiting disbursal.</p>
              )}
            </div>
            <Link href="/lending" className="mt-5 inline-flex text-sm font-medium underline underline-offset-4">
              Open loan desk
            </Link>
          </Card>
        </section>
      </div>
    );
  }

  return <OrgAdminDashboard />;
}
