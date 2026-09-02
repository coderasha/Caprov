'use client';

import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { useAuthStore } from '@/stores/auth-store';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useMemo, useState } from 'react';

interface CollateralRow {
  id: string;
  status: string;
  advanceableValue: number;
  availableAmount?: number;
  currency: string;
  asset?: { name: string } | null;
}

interface LoanRow {
  id: string;
  status: string;
  principal: number;
  outstanding: number;
  currency: string;
  interestRateBps: number;
  termDays: number;
  ltvBps: number;
  disbursedAt?: string;
  asset?: { name: string } | null;
  collateral?: CollateralRow | null;
}

interface WalletBalance {
  currency: string;
  balance: number;
}

interface OrgSummary {
  walletBalances: WalletBalance[];
}

function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string | string[] } | undefined;
    if (Array.isArray(data?.message)) return data.message.join(', ');
    if (typeof data?.message === 'string') return data.message;
    return error.message;
  }
  return error instanceof Error ? error.message : 'Request failed';
}

export default function LendingPage() {
  const queryClient = useQueryClient();
  const roles = useAuthStore((state) => state.roles);
  const [collateralId, setCollateralId] = useState('');
  const [principal, setPrincipal] = useState('10000000');
  const [formError, setFormError] = useState<string | null>(null);
  const canRequestDisbursal =
    roles.includes('ORG_ADMIN') || roles.includes('ANALYST') || roles.includes('PLATFORM_ADMIN');
  const canApproveDisbursal =
    roles.includes('COMPLIANCE') || roles.includes('ORG_ADMIN') || roles.includes('PLATFORM_ADMIN');
  const loans = useQuery({
    queryKey: ['lending'],
    queryFn: async () => (await api.get<LoanRow[]>('/lending')).data,
  });
  const collateral = useQuery({
    queryKey: ['collateral'],
    queryFn: async () => (await api.get<CollateralRow[]>('/collateral')).data,
  });
  const orgQuery = useQuery({
    queryKey: ['organization'],
    queryFn: async () => (await api.get<OrgSummary>('/organizations/current')).data,
  });
  const activeCollateral = useMemo(
    () => (collateral.data ?? []).filter((item) => item.status === 'ACTIVE'),
    [collateral.data],
  );
  const selected = activeCollateral.find((item) => item.id === collateralId);
  const create = useMutation({
    mutationFn: async () =>
      api.post('/lending', {
        collateralId,
        principal: Number(principal),
      }),
    onSuccess: async () => {
      setCollateralId('');
      setFormError(null);
      await queryClient.invalidateQueries({ queryKey: ['lending'] });
      await queryClient.invalidateQueries({ queryKey: ['collateral'] });
      await queryClient.invalidateQueries({ queryKey: ['organization'] });
    },
    onError: (error) => setFormError(errorMessage(error)),
  });
  const disburse = useMutation({
    mutationFn: async (id: string) => api.post(`/lending/${id}/disburse`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['lending'] });
      await queryClient.invalidateQueries({ queryKey: ['collateral'] });
      await queryClient.invalidateQueries({ queryKey: ['organization'] });
    },
  });
  const repay = useMutation({
    mutationFn: async (id: string) => api.post(`/lending/${id}/repay`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['lending'] });
      await queryClient.invalidateQueries({ queryKey: ['collateral'] });
      await queryClient.invalidateQueries({ queryKey: ['organization'] });
    },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Lending"
        title="Collateralized facilities"
        description="Request fund disbursal against approved collateral. Bank approval activates the facility and credits the asset-owner wallet."
      />
      <Card className="p-6">
        <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">Asset-owner wallet</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          {(orgQuery.data?.walletBalances ?? []).length ? (
            orgQuery.data?.walletBalances.map((wallet) => (
              <div key={wallet.currency} className="rounded-2xl border border-[var(--line)] px-4 py-3">
                <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">{wallet.currency}</p>
                <p className="mt-2 font-display text-xl font-semibold text-[var(--ink)]">
                  {money(wallet.balance, wallet.currency)}
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm text-[var(--muted)]">No disbursals posted yet.</p>
          )}
        </div>
      </Card>
      <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">Request disbursal</h2>
          <form
            className="mt-4 grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              setFormError(null);
              create.mutate();
            }}
          >
            <Field label="Collateral">
              <Select value={collateralId} onChange={(e) => setCollateralId(e.target.value)} required>
                <option value="">Select collateral</option>
                {activeCollateral.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.asset?.name ?? item.id} · available{' '}
                    {money(item.availableAmount ?? item.advanceableValue, item.currency)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Principal">
              <Input value={principal} onChange={(e) => setPrincipal(e.target.value)} required />
            </Field>
            {selected ? (
              <p className="text-sm text-[var(--muted)]">
                Available capacity{' '}
                {money(selected.availableAmount ?? selected.advanceableValue, selected.currency)}
              </p>
            ) : null}
            {formError ? <p className="text-sm text-red-700">{formError}</p> : null}
            <Button type="submit" disabled={!collateralId || create.isPending || !canRequestDisbursal}>
              Submit for bank approval
            </Button>
          </form>
        </Card>
        <div className="grid gap-4">
          {(loans.data ?? []).map((loan) => (
            <Card key={loan.id} className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">
                    {loan.asset?.name ?? loan.id}
                  </h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {money(loan.principal, loan.currency)} principal · {money(loan.outstanding, loan.currency)} outstanding · LTV{' '}
                    {(loan.ltvBps / 100).toFixed(1)}% · {(loan.interestRateBps / 100).toFixed(2)}% ·{' '}
                    {loan.termDays}d
                  </p>
                </div>
                <Badge>{loan.status}</Badge>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                {loan.status === 'PENDING_APPROVAL' && canApproveDisbursal ? (
                  <Button onClick={() => disburse.mutate(loan.id)} disabled={disburse.isPending}>
                    Approve and disburse
                  </Button>
                ) : null}
                {loan.status === 'ACTIVE' ? (
                  <Button onClick={() => repay.mutate(loan.id)}>Repay</Button>
                ) : null}
              </div>
              {loan.disbursedAt ? (
                <p className="mt-3 text-sm text-[var(--muted)]">
                  Disbursed on {loan.disbursedAt.slice(0, 10)} into the asset-owner wallet.
                </p>
              ) : null}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
