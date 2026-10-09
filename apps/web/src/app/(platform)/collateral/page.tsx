'use client';

import { PageHeader } from '@/components/layout/page-header';
import { useWallet } from '@/components/wallet/wallet-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { capPricePerUnitFromTotal, closeOnChainListing, createOnChainListing, lockCollateralOnSepolia } from '@/lib/sepolia-marketplace';
import type { HydratedAsset } from '@/lib/types';
import { useAuthStore } from '@/stores/auth-store';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import Link from 'next/link';
import { useMemo, useState } from 'react';

interface LoanSummary {
  id: string;
  status: string;
  outstanding: number;
  currency: string;
}

interface CollateralRow {
  id: string;
  assetId: string;
  status: string;
  approvedAt?: string;
  pledgedValue: number;
  advanceableValue: number;
  utilizedAmount: number;
  availableAmount: number;
  canRelease: boolean;
  activeLoanCount: number;
  currency: string;
  haircutBps: number;
  collateralBps?: number;
  lockedTokenUnits?: number;
  tokenId?: string;
  asset?: { name: string } | null;
  token?: { id: string; mode: string; supply?: number } | null;
  marketValuation?: CollateralMarketValuation | null;
  loans?: LoanSummary[];
  valuation?: {
    payload: {
      amount: number;
      currency: string;
      asOf?: string;
      method?: string;
      low?: number;
      high?: number;
    };
  } | null;
}

interface TokenOption {
  id: string;
  assetId: string;
  tokenId: string;
  supply: number;
  recipientAddress: string;
  contractAddress?: string;
  status: string;
  asset?: { name: string } | null;
}

interface ExistingListing {
  id: string;
  assetId: string;
  tokenPositionId?: string;
  title: string;
  summary?: string;
  imageUrl?: string;
  askPrice: number;
  status: string;
  onChainListingId?: string;
  onChainCloseTxHash?: string;
}

interface CollateralMarketValuation {
  pricePerTokenUsd: number;
  assetValueUsd: number;
  source: 'SETTLED_CAP_VWAP' | 'TOKENIZED_LISTING_PRICE';
  sourceLabel: string;
  settledTradeCount: number;
  observedAt: string;
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

export default function CollateralPage() {
  const queryClient = useQueryClient();
  const roles = useAuthStore((state) => state.roles);
  const { address: wallet, network } = useWallet();
  const [assetId, setAssetId] = useState('');
  const [tokenId, setTokenId] = useState('');
  const [collateralBps, setCollateralBps] = useState('1000');
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const collateral = useQuery({
    queryKey: ['collateral'],
    queryFn: async () => (await api.get<CollateralRow[]>('/collateral')).data,
  });
  const assets = useQuery({
    queryKey: ['assets'],
    queryFn: async () => (await api.get<HydratedAsset[]>('/assets')).data,
  });
  const tokens = useQuery({
    queryKey: ['tokenization'],
    queryFn: async () =>
      (await api.get<{ tokens: TokenOption[] }>('/tokenization')).data.tokens,
  });
  const listings = useQuery({
    queryKey: ['marketplace'],
    queryFn: async () => (await api.get<{ listings: ExistingListing[] }>('/marketplace')).data.listings,
  });

  const canManageCollateral =
    roles.includes('ORG_ADMIN') || roles.includes('ANALYST') || roles.includes('PLATFORM_ADMIN');
  const isBankerReview = roles.includes('BANKER');

  const activeAssetIds = useMemo(
    () =>
      new Set(
        (collateral.data ?? [])
          .filter((item) => item.status === 'ACTIVE' || item.status === 'PENDING_APPROVAL')
          .map((item) => item.assetId),
      ),
    [collateral.data],
  );
  const pledgedTokenIds = useMemo(
    () =>
      new Set(
        (collateral.data ?? [])
          .filter(
            (item) =>
              (item.status === 'ACTIVE' || item.status === 'PENDING_APPROVAL') &&
              item.tokenId,
          )
          .map((item) => item.tokenId as string),
      ),
    [collateral.data],
  );

  const pledgeableAssets = useMemo(
    () => (assets.data ?? []).filter((asset) => !activeAssetIds.has(asset.id)),
    [assets.data, activeAssetIds],
  );
  const selectedAsset = (assets.data ?? []).find((asset) => asset.id === assetId);
  const selectedToken = (tokens.data ?? []).find((token) => token.id === tokenId);
  const previewUnits = selectedToken
    ? Math.floor((selectedToken.supply * Number(collateralBps || 0)) / 10_000)
    : 0;
  const marketValuation = useQuery({
    queryKey: ['collateral-market-valuation', assetId, tokenId],
    enabled: Boolean(assetId && tokenId),
    retry: false,
    queryFn: async () =>
      (
        await api.get<CollateralMarketValuation>(
          `/collateral/valuation/${assetId}?tokenId=${encodeURIComponent(tokenId)}`,
        )
      ).data,
  });
  const previewPledged = marketValuation.data
    ? Number(
        (marketValuation.data.pricePerTokenUsd * previewUnits).toFixed(2),
      )
    : 0;
  const existingListing = (listings.data ?? []).find((listing) =>
    listing.assetId === assetId && listing.tokenPositionId === tokenId && listing.status === 'OPEN' && !listing.onChainListingId,
  );
  const activeOnChainListing = (listings.data ?? []).find((listing) =>
    listing.assetId === assetId && listing.tokenPositionId === tokenId && listing.status === 'OPEN' && Boolean(listing.onChainListingId),
  );

  const availableTokens = useMemo(
    () =>
      (tokens.data ?? []).filter(
        (token) =>
          token.status === 'CONFIRMED' &&
          (!assetId || token.assetId === assetId) &&
          !pledgedTokenIds.has(token.id),
      ),
    [tokens.data, assetId, pledgedTokenIds],
  );
  const selectedAssetTokens = useMemo(
    () => (tokens.data ?? []).filter((token) => token.assetId === assetId),
    [tokens.data, assetId],
  );
  const selectedAssetHasPledgedToken = selectedAssetTokens.some((token) =>
    pledgedTokenIds.has(token.id),
  );

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['collateral'] });
    await queryClient.invalidateQueries({ queryKey: ['lending'] });
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!selectedToken || previewUnits < 1) throw new Error('Choose a percentage that locks at least one ERC-1155 unit.');
      if (activeOnChainListing) throw new Error('Close the active on-chain listing first so its escrowed token units return to your wallet.');
      // This opens MetaMask and waits for a confirmed Sepolia transaction. The
      // server subsequently verifies the vault event before recording anything.
      const lock = await lockCollateralOnSepolia({
        tokenId: selectedToken.tokenId,
        units: String(previewUnits),
      });
      return api.post('/collateral', {
        assetId, tokenId, collateralBps: Number(collateralBps),
        vaultCollateralId: lock.collateralId, vaultTxHash: lock.txHash,
        borrowerWalletAddress: selectedToken.recipientAddress,
      });
    },
    onSuccess: async () => {
      setAssetId('');
      setTokenId('');
      setCollateralBps('1000');
      setFormError(null);
      await refresh();
    },
    onError: (error) => setFormError(errorMessage(error)),
  });

  const closeOnChain = useMutation({
    mutationFn: async () => {
      if (!activeOnChainListing?.onChainListingId) throw new Error('No active on-chain listing is available to close.');
      if (!wallet) throw new Error('Connect the listing wallet from the top-right menu first.');
      const closed = await closeOnChainListing(activeOnChainListing.onChainListingId);
      return api.post(`/marketplace/on-chain-listings/${activeOnChainListing.id}/sync`, { closeTxHash: closed.txHash });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['marketplace'] });
      await queryClient.invalidateQueries({ queryKey: ['collateral-market-valuation', assetId, tokenId] });
      setFormError(null);
    },
    onError: (error) => setFormError(errorMessage(error)),
  });

  const publishOnChain = useMutation({
    mutationFn: async () => {
      if (!selectedToken || !existingListing) throw new Error('Select a token position with an open listing first.');
      if (!wallet) throw new Error('Connect the token-holder MetaMask wallet from the top-right menu first.');
      if (wallet.toLowerCase() !== selectedToken.recipientAddress.toLowerCase()) throw new Error('Connect the wallet that holds this token position before publishing it.');
      const pricePerToken = capPricePerUnitFromTotal(String(existingListing.askPrice), String(selectedToken.supply));
      const onChain = await createOnChainListing({ assetTokenId: selectedToken.tokenId, units: String(selectedToken.supply), pricePerToken });
      return api.post('/marketplace/on-chain-listings', {
        sourceListingId: existingListing.id,
        assetId,
        tokenPositionId: selectedToken.id,
        onChainListingId: onChain.listingId,
        onChainTxHash: onChain.txHash,
        listerWalletAddress: onChain.sellerAddress,
        availableTokenUnits: selectedToken.supply,
        pricePerTokenWei: onChain.pricePerTokenWei,
        askPrice: existingListing.askPrice,
        title: existingListing.title,
        summary: existingListing.summary,
        imageUrl: existingListing.imageUrl,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['marketplace'] });
      await queryClient.invalidateQueries({ queryKey: ['collateral-market-valuation', assetId, tokenId] });
      setFormError(null);
    },
    onError: (error) => setFormError(errorMessage(error)),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Collateral"
        title={isBankerReview ? 'Review pledged collateral' : 'Pledge DNA-backed assets'}
        description={
          isBankerReview
            ? 'Review the evidence, document record, and Asset DNA valuation before making a collateral decision.'
            : 'Submit assets or tokenized positions for bank review. Approvers can inspect valuation details before activating collateral for lending.'
        }
      />
      <div className={isBankerReview ? 'grid gap-4' : 'grid gap-6 lg:grid-cols-[0.85fr_1.15fr]'}>
        {!isBankerReview ? <Card className="p-6">
          <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">Submit collateral</h2>
          <form
            className="mt-4 grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              setFormError(null);
              create.mutate();
            }}
          >
            <Field label="Asset">
              <Select
                value={assetId}
                onChange={(e) => {
                  setAssetId(e.target.value);
                  setTokenId('');
                }}
                required
              >
                <option value="">Select asset</option>
                {pledgeableAssets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name}
                  </option>
                ))}
              </Select>
            </Field>
            {!pledgeableAssets.length ? (
              <p className="text-sm text-[var(--muted)]">
                All tokenized assets already have an active or pending pledge. Release one
                to pledge again.
              </p>
            ) : null}
            <Field label="Token position">
              <Select value={tokenId} onChange={(e) => setTokenId(e.target.value)} required>
                <option value="">Select confirmed token position</option>
                {availableTokens.map((token) => (
                  <option key={token.id} value={token.id}>
                    {token.asset?.name ?? token.id}
                  </option>
                ))}
              </Select>
            </Field>
            {assetId && !availableTokens.length ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-3 text-sm text-amber-950">
                <p className="font-medium">
                  {selectedAssetHasPledgedToken
                    ? 'This asset’s token position is already pledged.'
                    : 'No confirmed token position is registered for this asset.'}
                </p>
                <p className="mt-1 text-amber-900/80">
                  {selectedAssetHasPledgedToken
                    ? 'Release the existing collateral position before submitting it again.'
                    : 'Owner-held ERC-1155 units must be linked to this asset in CAPROV before they can be selected as collateral.'}
                </p>
                {!selectedAssetHasPledgedToken ? (
                  <Link
                    className="mt-2 inline-flex font-medium text-[var(--ink)] underline underline-offset-4"
                    href="/marketplace"
                  >
                    Register or verify token position →
                  </Link>
                ) : null}
              </div>
            ) : null}
            <Field label="Collateral percentage (bps)">
              <Input
                type="number"
                min={1}
                max={10000}
                value={collateralBps}
                onChange={(e) => setCollateralBps(e.target.value)}
                placeholder="1000 = 10%"
                required
              />
            </Field>
            {marketValuation.isLoading ? (
              <p className="text-sm text-[var(--muted)]">
                Loading tokenized collateral reference…
              </p>
            ) : null}
            {marketValuation.data && previewPledged > 0 ? (
              <p className="text-sm text-[var(--muted)]">
                {(Number(collateralBps) / 100).toFixed(2)}% equals {money(previewPledged, 'USD')} at{' '}
                {money(marketValuation.data.pricePerTokenUsd, 'USD')} per ERC-1155 unit ({marketValuation.data.sourceLabel}).{' '}
                {previewUnits.toLocaleString()} ERC-1155 units will be locked in the {network.chainName} vault. The banker applies the haircut and loan limit during underwriting.
              </p>
            ) : null}
            {activeOnChainListing ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-3 text-sm text-amber-950">
                <p>The active {network.chainName} listing holds this token position in marketplace escrow. Close it to return the unsold units to your wallet before pledging collateral.</p>
                <Button type="button" className="mt-3" variant="secondary" disabled={closeOnChain.isPending || !wallet} onClick={() => { setFormError(null); closeOnChain.mutate(); }}>
                  {closeOnChain.isPending ? `Closing listing on ${network.chainName}…` : 'Close listing and recover units'}
                </Button>
              </div>
            ) : null}
            {assetId && tokenId && marketValuation.isError ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-3 text-sm text-amber-950">
                <p>This token position has no collateral reference yet. Publish an on-chain CAP listing to establish its initial USD price, or settle a CAP trade.</p>
                {existingListing ? <Button type="button" className="mt-3" variant="secondary" disabled={publishOnChain.isPending || !wallet} onClick={() => { setFormError(null); publishOnChain.mutate(); }}>
                  {publishOnChain.isPending ? `Publishing on ${network.chainName}…` : `Publish ${existingListing.title} on ${network.chainName}`}
                </Button> : <p className="mt-2 text-xs text-amber-900/80">Create an open listing for this token position in Marketplace first.</p>}
                {existingListing && !wallet ? <p className="mt-2 text-xs text-amber-900/80">Connect the token-holder wallet from the top-right menu to publish.</p> : null}
              </div>
            ) : null}
            {formError ? <p className="text-sm text-red-700">{formError}</p> : null}
            <Button type="submit" disabled={!assetId || !tokenId || !marketValuation.data || Boolean(activeOnChainListing) || create.isPending || !canManageCollateral}>
              {create.isPending ? `Waiting for ${network.chainName} confirmation…` : `Lock collateral on ${network.chainName}`}
            </Button>
          </form>
        </Card> : null}

        <div className="grid gap-4">
          {actionError ? (
            <Card className="border-red-200 bg-red-50/70 p-4 text-sm text-red-800">{actionError}</Card>
          ) : null}
          {collateral.isLoading ? (
            <Card className="p-6 text-sm text-[var(--muted)]">Loading collateral…</Card>
          ) : null}
          {collateral.isError ? (
            <Card className="p-6 text-sm text-red-700">{errorMessage(collateral.error)}</Card>
          ) : null}
          {!collateral.isLoading && !(collateral.data ?? []).length ? (
            <Card className="p-6 text-sm text-[var(--muted)]">No collateral positions yet.</Card>
          ) : null}
          {(collateral.data ?? []).map((item) => (
            <Card key={item.id} className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">
                    {item.asset?.name ?? item.id}
                  </h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    pledged {money(item.pledgedValue, item.currency)} · collateral{' '}
                    {item.collateralBps != null ? `${(item.collateralBps / 100).toFixed(2)}%` : 'legacy position'}
                    {item.lockedTokenUnits != null ? ` · ${item.lockedTokenUnits.toLocaleString()} ERC-1155 units` : ''}
                  </p>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    utilized {money(item.utilizedAmount ?? 0, item.currency)} · available{' '}
                    {money(item.availableAmount ?? item.advanceableValue, item.currency)}
                    {item.token ? ` · token ${item.token.mode}` : ''}
                  </p>
                  {item.marketValuation ? (
                    <div className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--paper)]/60 px-3 py-3 text-sm text-[var(--muted)]">
                      <p className="font-medium text-[var(--ink)]">
                        Tokenized collateral reference {money(item.marketValuation.assetValueUsd, 'USD')}
                      </p>
                      <p className="mt-1">
                        {money(item.marketValuation.pricePerTokenUsd, 'USD')} per ERC-1155 unit · {item.marketValuation.sourceLabel}
                      </p>
                      <p className="mt-1">
                        Observed {item.marketValuation.observedAt.slice(0, 10)} · {item.marketValuation.settledTradeCount} settled CAP trade{item.marketValuation.settledTradeCount === 1 ? '' : 's'}
                      </p>
                    </div>
                  ) : null}
                  {isBankerReview && item.asset ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link href={`/assets/${item.assetId}?tab=documents`}>
                        <Button variant="secondary">Check documents</Button>
                      </Link>
                      <Link href={`/intelligence/dna/${item.assetId}`}>
                        <Button variant="secondary">Check valuation</Button>
                      </Link>
                      <Link href={`/intelligence/copilot?asset=${encodeURIComponent(item.assetId)}&locked=1`}>
                        <Button variant="secondary">Ask AI about asset</Button>
                      </Link>
                    </div>
                  ) : null}
                </div>
                <Badge>{item.status}</Badge>
              </div>

              {item.status === 'PENDING_APPROVAL' ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <p className="text-sm text-[var(--muted)]">Locked on {network.chainName} and awaiting a bank loan offer.</p>
                </div>
              ) : null}

              {(item.loans?.length ?? 0) > 0 ? (
                <div className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--paper)]/60 px-3 py-2 text-sm">
                  <p className="font-medium">
                    {item.activeLoanCount} active loan{item.activeLoanCount === 1 ? '' : 's'}
                  </p>
                  <ul className="mt-1 space-y-1 text-[var(--muted)]">
                    {item.loans?.map((loan) => (
                      <li key={loan.id}>
                        {loan.id} · outstanding {money(loan.outstanding, loan.currency)}
                      </li>
                    ))}
                  </ul>
                  <Link href="/lending" className="mt-2 inline-block text-[var(--ink)] underline">
                    Manage on Lending
                  </Link>
                </div>
              ) : null}

              {item.status === 'ACTIVE' ? (
                <p className="mt-2 text-xs text-[var(--muted)]">
                  Collateral remains locked until the facility is repaid and the bank confirms the on-chain ERC-1155 release from Lending.
                </p>
              ) : null}
              {item.status === 'ACTIVE' && item.approvedAt ? (
                <p className="mt-2 text-xs text-[var(--muted)]">
                  Approved on {item.approvedAt.slice(0, 10)} for lending use.
                </p>
              ) : null}

            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
