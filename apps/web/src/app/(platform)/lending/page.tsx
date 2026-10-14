'use client';

import { PageHeader } from '@/components/layout/page-header';
import { useWallet } from '@/components/wallet/wallet-provider';
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
import { ArrowRight, Building2, ChevronDown, CircleAlert, Landmark, Search, WalletCards } from 'lucide-react';

interface CollateralRow {
  id: string;
  status: string;
  advanceableValue: number;
  availableAmount?: number;
  currency: string;
  vaultCollateralId?: string;
  vaultTxHash?: string;
  asset?: { name: string; assetClass?: string; primaryImageUrl?: string } | null;
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
  asset?: { name: string; assetClass?: string; primaryImageUrl?: string } | null;
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
  const { address: wallet, network } = useWallet();
  const roles = useAuthStore((state) => state.roles);
  const [collateralId, setCollateralId] = useState('');
  const [principal, setPrincipal] = useState('10000000');
  const [haircutBps, setHaircutBps] = useState('1500');
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loanSearch, setLoanSearch] = useState('');
  const [loanFilter, setLoanFilter] = useState<'ALL' | 'ACTIVE' | 'REPAID' | 'PENDING'>('ALL');
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
  // A loan is tied to one collateral position, rather than to the asset as a
  // whole. Once that position has been released, its release workflow is
  // complete. A later pledge for the same asset creates a new ACTIVE position
  // and can therefore be released after its own repayment.
  const canReleaseCollateral = (loan: LoanRow) =>
    loan.status === 'REPAID' &&
    canApproveDisbursal &&
    loan.collateral?.status === 'ACTIVE' &&
    Boolean(loan.collateral.vaultCollateralId);
  const selected = requestableCollateral.find((item) => item.id === collateralId);
  const visibleLoans = useMemo(() => (loans.data ?? []).filter((loan) => {
    const matchesSearch = !loanSearch.trim() || (loan.asset?.name ?? loan.id).toLowerCase().includes(loanSearch.trim().toLowerCase());
    const matchesFilter = loanFilter === 'ALL' || (loanFilter === 'PENDING' ? ['PENDING_APPROVAL', 'OFFERED', 'ACCEPTED'].includes(loan.status) : loan.status === loanFilter);
    return matchesSearch && matchesFilter;
  }), [loans.data, loanSearch, loanFilter]);
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
      if (!collateralId) throw new Error(`This loan does not have a live ${network.chainName} vault collateral record.`);
      if (!wallet) throw new Error('Connect the banker MetaMask wallet before activating the vault.');
      try {
        await api.post('/lending/vault/authorize-executor', { walletAddress: wallet });
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
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: ['lending'] });
      await queryClient.invalidateQueries({ queryKey: ['collateral'] });
      await queryClient.invalidateQueries({ queryKey: ['organization'] });
    },
    onError: (error) => setActionError(errorMessage(error)),
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
      if (!collateralId) throw new Error(`This loan does not have a live ${network.chainName} vault collateral record.`);
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

  const walletBalance = orgQuery.data?.walletBalances?.[0];
  return <div className="lending-page mx-auto w-full max-w-[1480px]">
    <section className="lending-hero"><div><p className="lending-eyebrow">Lending</p><h1>Collateralized facilities</h1><p>Request fund disbursal against approved collateral. Bank approval activates the facility and credits the asset-owner wallet.</p></div><aside>Unlock liquidity<br />with your tokenized<br />real-world assets.<i /></aside></section>
    <div className="lending-layout"><div className="lending-left"><section className="lending-wallet"><span><Landmark size={28} /></span><div><h2>{canApproveDisbursal ? 'Bank simulated USD treasury' : 'Asset-owner simulated USD wallet'}</h2><div className="lending-wallet__balance"><small>{walletBalance?.currency ?? 'USD'}</small><strong>{walletBalance ? (canApproveDisbursal ? exactMoney(walletBalance.balance, walletBalance.currency) : money(walletBalance.balance, walletBalance.currency)) : '$0'}</strong></div></div></section>
      <section className="lending-request"><div className="lending-request__heading"><span><Landmark size={26} /></span><div><h2>{isBanker ? 'Underwrite collateral' : 'Request disbursal'}</h2><p>{isBanker ? `Set a bank haircut and proposed USD principal against ${network.chainName}-locked collateral.` : 'Submit a loan request against your approved collateral.'}</p></div></div><form onSubmit={(event) => { event.preventDefault(); setFormError(null); isBanker ? offerFromCollateral.mutate() : create.mutate(); }}><label htmlFor="loan-collateral">{isBanker ? 'Locked borrower collateral' : 'Collateral'} <b>*</b></label><div className="lending-field"><WalletCards size={20} /><Select id="loan-collateral" value={collateralId} onChange={(event) => setCollateralId(event.target.value)} required><option value="">Select collateral</option>{requestableCollateral.filter((item) => !isBanker || item.status === 'PENDING_APPROVAL').map((item) => <option key={item.id} value={item.id}>{item.asset?.name ?? item.id} · available {money(item.availableAmount ?? item.advanceableValue, item.currency)}</option>)}</Select></div><small>{isBanker ? 'Choose collateral awaiting bank review.' : 'Choose the collateralized asset to request a loan against.'}</small><label htmlFor="loan-principal">{isBanker ? 'Proposed principal (USD)' : 'Principal (USD)'} <b>*</b></label><div className="lending-field"><span className="lending-dollar">$</span><Input id="loan-principal" inputMode="numeric" value={principal} onChange={(event) => setPrincipal(event.target.value.replace(/[^0-9]/g, ''))} required /></div><small>Enter the loan amount in USD.</small>{isBanker ? <><label htmlFor="loan-haircut">Bank haircut (basis points) <b>*</b></label><div className="lending-field"><span className="lending-dollar">%</span><Input id="loan-haircut" inputMode="numeric" value={haircutBps} onChange={(event) => setHaircutBps(event.target.value.replace(/[^0-9]/g, ''))} required /></div></> : null}{selected ? <p className="lending-capacity">Available capacity {money(selected.availableAmount ?? selected.advanceableValue, selected.currency)}{isBanker ? ` · maximum offer ${money(selected.advanceableValue * (1 - Number(haircutBps || 0) / 10_000), selected.currency)}` : ''}</p> : null}{formError ? <p className="lending-error">{formError}</p> : null}<Button type="submit" variant="ink" className="lending-submit" disabled={!collateralId || (isBanker ? offerFromCollateral.isPending : create.isPending) || (!isBanker && !canRequestDisbursal)}><Landmark size={19} />{isBanker ? (offerFromCollateral.isPending ? 'Issuing offer…' : 'Issue loan offer') : (create.isPending ? 'Submitting…' : 'Submit for bank approval')}<ArrowRight size={19} /></Button></form></section></div>
      <section className="lending-assets"><header><div><h2>Collateralized assets</h2><p>View the status of your loan requests and repayment details.</p></div><div className="lending-tools"><label><Search size={17} /><input value={loanSearch} onChange={(event) => setLoanSearch(event.target.value)} placeholder="Search assets…" /></label><select value={loanFilter} onChange={(event) => setLoanFilter(event.target.value as typeof loanFilter)}><option value="ALL">All assets</option><option value="ACTIVE">Active</option><option value="REPAID">Repaid</option><option value="PENDING">Pending</option></select><ChevronDown size={15} /></div></header><div className="lending-list">{loans.isLoading ? <p className="lending-empty">Loading facilities…</p> : null}{!loans.isLoading && !visibleLoans.length ? <p className="lending-empty">No facilities match this filter.</p> : null}{visibleLoans.map((loan) => <LoanCard key={loan.id} loan={loan} isBanker={isBanker} canRequest={canRequestDisbursal} canApprove={canApproveDisbursal} canRelease={canReleaseCollateral(loan)} networkName={network.chainName} onOffer={() => offer.mutate(loan.id)} onAccept={() => accept.mutate(loan.id)} onDisburse={() => { setActionError(null); disburse.mutate(loan); }} onRepay={() => repay.mutate(loan.id)} onRelease={() => { setActionError(null); releaseCollateral.mutate(loan); }} busy={{ offer: offer.isPending, accept: accept.isPending, disburse: disburse.isPending, release: releaseCollateral.isPending }} />)}</div></section>
    </div>{actionError ? <p className="lending-error">{actionError}</p> : null}
  </div>;
}

function LoanCard({ loan, isBanker, canRequest, canApprove, canRelease, networkName, onOffer, onAccept, onDisburse, onRepay, onRelease, busy }: { loan: LoanRow; isBanker: boolean; canRequest: boolean; canApprove: boolean; canRelease: boolean; networkName: string; onOffer: () => void; onAccept: () => void; onDisburse: () => void; onRepay: () => void; onRelease: () => void; busy: { offer: boolean; accept: boolean; disburse: boolean; release: boolean } }) {
  const badge = loan.status === 'REPAID' ? 'Repaid' : loan.status.replaceAll('_', ' '); const assetClass = loan.asset?.assetClass?.replaceAll('_', ' ') ?? 'Private asset'; const image = loan.asset?.primaryImageUrl;
  return <article className="lending-loan-row"><div className="lending-loan-image" role={image ? 'img' : undefined} aria-label={image ? `${loan.asset?.name ?? 'Asset'} preview` : undefined} style={image ? { backgroundImage: `url(${image})` } : undefined}>{!image ? <Building2 size={27} /> : null}</div><div className="lending-loan-main"><div><h3>{loan.asset?.name ?? loan.id}</h3><span>{assetClass}</span></div><p>{money(loan.principal, loan.currency)} principal · {money(loan.outstanding, loan.currency)} outstanding · LTV {(loan.ltvBps / 100).toFixed(1)}% · {(loan.interestRateBps / 100).toFixed(2)}% · {loan.termDays}d</p><div className="lending-loan-note">{loan.status === 'REPAID' ? <>Repayment is posted. The bank must now release the ERC-1155 collateral on {networkName}.<small>Disbursed on {loan.disbursedAt?.slice(0, 10) ?? '—'} into the asset-owner wallet.</small></> : loan.status === 'ACTIVE' ? <>Facility is active and secured by tokenized collateral on {networkName}.<small>{loan.repaidAt ? `Repaid on ${loan.repaidAt.slice(0, 10)}` : 'Repayment is available to the asset owner.'}</small></> : <>Facility is {badge.toLowerCase()}. Complete the required workflow to progress this request.<small>{loan.disbursedAt ? `Disbursed on ${loan.disbursedAt.slice(0, 10)}` : 'Awaiting the next approval step.'}</small></>}</div></div><div className="lending-loan-actions"><em className={loan.status === 'REPAID' ? 'is-repaid' : ''}>{badge}</em>{loan.status === 'PENDING_APPROVAL' && canApprove ? <Button variant="secondary" onClick={onOffer} disabled={busy.offer}>Offer loan <ArrowRight size={15} /></Button> : null}{loan.status === 'OFFERED' && canRequest ? <Button variant="secondary" onClick={onAccept} disabled={busy.accept}>Accept offer <ArrowRight size={15} /></Button> : null}{loan.status === 'ACCEPTED' && canApprove ? <Button variant="secondary" onClick={onDisburse} disabled={busy.disburse}>{busy.disburse ? 'Activating…' : 'Disburse USD'} <ArrowRight size={15} /></Button> : null}{loan.status === 'ACTIVE' && !isBanker ? <Button variant="secondary" onClick={onRepay}>Repay <ArrowRight size={15} /></Button> : null}{canRelease ? <Button variant="secondary" onClick={onRelease} disabled={busy.release}>{busy.release ? 'Releasing…' : 'Release collateral'} <ArrowRight size={15} /></Button> : null}{!canRelease && loan.status !== 'PENDING_APPROVAL' && !(loan.status === 'OFFERED' && canRequest) && !(loan.status === 'ACCEPTED' && canApprove) && !(loan.status === 'ACTIVE' && !isBanker) ? <button type="button" onClick={() => document.getElementById('loan-collateral')?.focus()}>View details <ArrowRight size={15} /></button> : null}</div></article>;
}
