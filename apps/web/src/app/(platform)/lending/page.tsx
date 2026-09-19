'use client';

import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { activateCollateralLoanOnSepolia, releaseCollateralAfterRepaymentOnSepolia } from '@/lib/sepolia-marketplace';
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
  vaultCollateralId?: string;
  vaultTxHash?: string;
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
  vaultActivationTxHash?: string;
  ltvBps: number;
  disbursedAt?: string;
  repaidAt?: string;
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

function exactMoney(amount: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export default function LendingPage() {
  const queryClient = useQueryClient();
  const roles = useAuthStore((state) => state.roles);
  const [collateralId, setCollateralId] = useState('');
  const [principal, setPrincipal] = useState('10000000');
  const [haircutBps, setHaircutBps] = useState('1500');
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const canRequestDisbursal =
    roles.includes('ORG_ADMIN') || roles.includes('ANALYST') || roles.includes('PLATFORM_ADMIN');
  const canApproveDisbursal =
    roles.includes('BANKER') || roles.includes('PLATFORM_ADMIN');
  const isBanker = roles.includes('BANKER') || roles.includes('PLATFORM_ADMIN');
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
  const requestableCollateral = useMemo(
    () => (collateral.data ?? []).filter((item) => item.status === 'PENDING_APPROVAL' || item.status === 'ACTIVE'),
    [collateral.data],
  );
  const selected = requestableCollateral.find((item) => item.id === collateralId);
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
    mutationFn: async (loan: LoanRow) => {
      const collateralId = loan.collateral?.vaultCollateralId;
      if (!collateralId) throw new Error('This loan does not have a live Sepolia vault collateral record.');
      try {
        const activation = await activateCollateralLoanOnSepolia({ collateralId, loanId: loan.id });
        return api.post(`/lending/${loan.id}/disburse`, { vaultTxHash: activation.txHash });
      } catch (error) {
        // A prior confirmed activation may have succeeded while the backend
        // ledger request failed. Reuse the matching on-chain event safely.
        if (error instanceof Error && /not activatable/i.test(error.message)) {
          return api.post(`/lending/${loan.id}/disburse`, {});
        }
        throw error;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['lending'] });
      await queryClient.invalidateQueries({ queryKey: ['collateral'] });
      await queryClient.invalidateQueries({ queryKey: ['organization'] });
    },
  });
  const offer = useMutation({ mutationFn: async (id: string) => api.post(`/lending/${id}/offer`, { principal: Number(principal), haircutBps: Number(haircutBps), interestRateBps: 650, termDays: 365 }), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['lending'] }); } });
  const offerFromCollateral = useMutation({
    mutationFn: async () =>
      api.post(`/lending/collateral/${collateralId}/offer`, {
        principal: Number(principal),
        haircutBps: Number(haircutBps),
        interestRateBps: 650,
        termDays: 365,
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
  const accept = useMutation({ mutationFn: async (id: string) => api.post(`/lending/${id}/accept`), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['lending'] }); } });
  const repay = useMutation({
    mutationFn: async (id: string) => api.post(`/lending/${id}/repay`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['lending'] });
      await queryClient.invalidateQueries({ queryKey: ['collateral'] });
      await queryClient.invalidateQueries({ queryKey: ['organization'] });
    },
  });
  const releaseCollateral = useMutation({
    mutationFn: async (loan: LoanRow) => {
      const collateralId = loan.collateral?.vaultCollateralId;
      if (!collateralId) throw new Error('This loan does not have a live Sepolia vault collateral record.');
      const release = await releaseCollateralAfterRepaymentOnSepolia({ collateralId });
      return api.post(`/lending/${loan.id}/release-collateral`, { vaultTxHash: release.txHash });
    },
    onSuccess: async () => {
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: ['lending'] });
      await queryClient.invalidateQueries({ queryKey: ['collateral'] });
    },
    onError: (error) => setActionError(errorMessage(error)),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Lending"
        title="Collateralized facilities"
        description="Request fund disbursal against approved collateral. Bank approval activates the facility and credits the asset-owner wallet."
      />
      <Card className="p-6">
        <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">{canApproveDisbursal ? 'Bank simulated USD treasury' : 'Asset-owner simulated USD wallet'}</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          {(orgQuery.data?.walletBalances ?? []).length ? (
            orgQuery.data?.walletBalances.map((wallet) => (
              <div key={wallet.currency} className="rounded-2xl border border-[var(--line)] px-4 py-3">
                <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">{wallet.currency}</p>
                <p className="mt-2 font-display text-xl font-semibold text-[var(--ink)]">
                  {canApproveDisbursal ? exactMoney(wallet.balance, wallet.currency) : money(wallet.balance, wallet.currency)}
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
          {isBanker ? (
            <>
              <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">Underwrite collateral</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                Select Sepolia-locked borrower collateral, set the bank haircut and proposed USD principal, then issue an offer for the asset owner to accept.
              </p>
              <form
                className="mt-4 grid gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  setFormError(null);
                  offerFromCollateral.mutate();
                }}
              >
                <Field label="Locked borrower collateral">
                  <Select value={collateralId} onChange={(e) => setCollateralId(e.target.value)} required>
                    <option value="">Select collateral</option>
                    {requestableCollateral
                      .filter((item) => item.status === 'PENDING_APPROVAL')
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.asset?.name ?? item.id} · pledged {money(item.advanceableValue, item.currency)}
                        </option>
                      ))}
                  </Select>
                </Field>
                <Field label="Proposed principal (USD)">
                  <Input value={principal} onChange={(e) => setPrincipal(e.target.value)} required />
                </Field>
                <Field label="Bank haircut (basis points)">
                  <Input value={haircutBps} onChange={(e) => setHaircutBps(e.target.value)} required />
                </Field>
                {selected ? (
                  <p className="text-sm text-[var(--muted)]">
                    Pledged {money(selected.advanceableValue, selected.currency)} · maximum offer after haircut{' '}
                    {money(selected.advanceableValue * (1 - Number(haircutBps || 0) / 10_000), selected.currency)}
                  </p>
                ) : null}
                {formError ? <p className="text-sm text-red-700">{formError}</p> : null}
                <Button type="submit" disabled={!collateralId || offerFromCollateral.isPending}>
                  Issue loan offer
                </Button>
              </form>
              <div className="mt-5 grid gap-2 border-t border-[var(--line)] pt-4">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted)]">Collateral review queue</p>
                {requestableCollateral.length ? requestableCollateral.map((item) => (
                  <div key={item.id} className="rounded-xl border border-[var(--line)] bg-[var(--paper)]/50 px-3 py-3 text-sm">
                    <p className="font-medium text-[var(--ink)]">{item.asset?.name ?? item.id}</p>
                    <p className="mt-1 text-[var(--muted)]">
                      {item.status.replaceAll('_', ' ')} · collateral value {money(item.advanceableValue, item.currency)}
                    </p>
                  </div>
                )) : (
                  <p className="text-sm text-[var(--muted)]">No borrower collateral is awaiting review.</p>
                )}
              </div>
            </>
          ) : (
            <>
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
                    {requestableCollateral.map((item) => (
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
            </>
          )}
        </Card>
        <div className="grid gap-4">
          {actionError ? <Card className="border-red-200 bg-red-50/70 p-4 text-sm text-red-800">{actionError}</Card> : null}
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
                  <Button onClick={() => offer.mutate(loan.id)} disabled={offer.isPending}>
                    Offer loan · haircut {Number(haircutBps) / 100}%
                  </Button>
                ) : null}
                {loan.status === 'OFFERED' && canRequestDisbursal ? <Button onClick={() => accept.mutate(loan.id)} disabled={accept.isPending}>Accept bank offer</Button> : null}
                {loan.status === 'ACCEPTED' && canApproveDisbursal ? <Button onClick={() => disburse.mutate(loan)} disabled={disburse.isPending}>Activate vault & disburse USD</Button> : null}
                {loan.status === 'ACTIVE' && !isBanker ? (
                  <Button onClick={() => repay.mutate(loan.id)}>Repay</Button>
                ) : null}
                {loan.status === 'REPAID' && canApproveDisbursal && loan.collateral?.vaultCollateralId ? (
                  <Button onClick={() => { setActionError(null); releaseCollateral.mutate(loan); }} disabled={releaseCollateral.isPending}>
                    Release collateral on Sepolia
                  </Button>
                ) : null}
              </div>
              {loan.status === 'REPAID' && !canApproveDisbursal ? (
                <p className="mt-3 text-sm text-[var(--muted)]">Repayment is posted. The bank must now release the ERC-1155 collateral on Sepolia.</p>
              ) : null}
              {loan.status === 'REPAID' && canApproveDisbursal && loan.collateral?.vaultCollateralId ? (
                <p className="mt-3 text-sm text-[var(--muted)]">Sign from the configured bank custody (vault-owner) wallet. CAPROV will mark this collateral released only after the Sepolia release event is confirmed.</p>
              ) : null}
              {canApproveDisbursal && loan.disbursedAt ? (
                <p className="mt-3 text-sm text-[var(--muted)]">
                  Bank treasury debited {exactMoney(loan.principal, loan.currency)} on {loan.disbursedAt.slice(0, 10)}
                  {loan.repaidAt ? ` and credited ${exactMoney(loan.principal, loan.currency)} on ${loan.repaidAt.slice(0, 10)}.` : '.'}
                </p>
              ) : null}
              {loan.disbursedAt ? (
                <p className="mt-3 text-sm text-[var(--muted)]">
                  Disbursed on {loan.disbursedAt.slice(0, 10)} into the asset-owner wallet.
                </p>
              ) : null}
              {isBanker && loan.status === 'ACTIVE' && loan.disbursedAt && (loan.vaultActivationTxHash || loan.collateral?.vaultTxHash) ? (
                <a
                  href={`https://sepolia.etherscan.io/tx/${loan.vaultActivationTxHash ?? loan.collateral?.vaultTxHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex text-sm font-medium text-[var(--teal)] underline underline-offset-4"
                >
                  {loan.vaultActivationTxHash ? 'View vault activation transaction' : 'View collateral vault transaction'} →
                </a>
              ) : null}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
