'use client';

import { BankerCollateralReview } from '@/components/collateral/banker-collateral-review';
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
import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ArrowRight, Building2, ChevronDown, CircleAlert, Landmark, LockKeyhole, Search, ShieldCheck, WalletCards } from 'lucide-react';

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
  const roles = useAuthStore((state) => state.roles);
  const searchParams = useSearchParams();
  const bankerOnly =
    roles.includes('BANKER') &&
    !roles.some((role) => ['ORG_ADMIN', 'ANALYST', 'PLATFORM_ADMIN', 'BUYER'].includes(role));

  if (bankerOnly) {
    return (
      <BankerCollateralReview
        initialCollateralId={searchParams.get('id')?.trim() || ''}
        initialAssetId={searchParams.get('asset')?.trim() || ''}
      />
    );
  }

  return <CollateralOperatorPage />;
}

function CollateralOperatorPage() {
  const queryClient = useQueryClient();
  const roles = useAuthStore((state) => state.roles);
  const { address: wallet, network } = useWallet();
  const [assetId, setAssetId] = useState('');
  const [tokenId, setTokenId] = useState('');
  const [collateralBps, setCollateralBps] = useState('1000');
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [assetSearch, setAssetSearch] = useState('');
  const [assetFilter, setAssetFilter] = useState<'ALL' | 'AVAILABLE' | 'PLEDGED'>('ALL');

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
  const visibleCollateral = collateral.data ?? [];

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
  const assetRows = useMemo(() => (assets.data ?? [])
    .map((asset) => ({ asset, token: (tokens.data ?? []).find((token) => token.assetId === asset.id && token.status === 'CONFIRMED'), collateral: (collateral.data ?? []).find((item) => item.assetId === asset.id) }))
    .filter(({ asset, token, collateral: item }) => {
      const query = assetSearch.trim().toLowerCase();
      const matchesSearch = !query || asset.name.toLowerCase().includes(query) || asset.assetClass.toLowerCase().includes(query);
      const matchesFilter = assetFilter === 'ALL' || (assetFilter === 'PLEDGED' ? Boolean(item) : Boolean(token) && !item);
      return matchesSearch && matchesFilter;
    }), [assets.data, tokens.data, collateral.data, assetSearch, assetFilter]);

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

  return <div className="collateral-page mx-auto w-full max-w-[1480px]">
    <section className="collateral-hero"><div><p className="collateral-eyebrow">Collateral</p><h1>Pledge DNA-backed assets</h1><p>Submit assets or tokenized positions for bank review. Approvers can inspect valuation details before activating collateral for lending.</p></div><aside>Unlock liquidity<br />with trusted<br />asset collateral.<i /></aside></section>
    <div className="collateral-layout">
      <section className="collateral-submit" aria-labelledby="submit-collateral-heading"><div className="collateral-submit__heading"><span><ShieldCheck size={27} /></span><div><h2 id="submit-collateral-heading">Submit collateral</h2><p>Lock your assets or tokenized positions as collateral on<br className="hidden xl:block" /> {network.chainName} for lending.</p></div></div>
        <form onSubmit={(event) => { event.preventDefault(); setFormError(null); create.mutate(); }}>
          <label htmlFor="collateral-asset">Asset <b>*</b></label><div className="collateral-field"><Landmark size={20} /><Select id="collateral-asset" value={assetId} onChange={(event) => { setAssetId(event.target.value); setTokenId(''); }} required><option value="">Select asset</option>{pledgeableAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</Select></div>
          <label htmlFor="collateral-token">Token position <b>*</b></label><div className="collateral-field"><WalletCards size={20} /><Select id="collateral-token" value={tokenId} onChange={(event) => setTokenId(event.target.value)} required><option value="">Select confirmed token position</option>{availableTokens.map((token) => <option key={token.id} value={token.id}>{token.asset?.name ?? token.id}</option>)}</Select></div>
          <label htmlFor="collateral-bps">Collateral percentage (bps) <b>*</b></label><div className="collateral-field"><span className="collateral-percent">%</span><Input id="collateral-bps" type="number" min={1} max={10000} value={collateralBps} onChange={(event) => setCollateralBps(event.target.value)} placeholder="1000 = 10%" required /></div><small>Collateral percentage in basis points (BPS). 10000 BPS = 100%.</small>
          {marketValuation.data && previewPledged > 0 ? <p className="collateral-value-note">{(Number(collateralBps) / 100).toFixed(2)}% equals {money(previewPledged, 'USD')} at {money(marketValuation.data.pricePerTokenUsd, 'USD')} per ERC-1155 unit. {previewUnits.toLocaleString()} units will be locked.</p> : null}
          {assetId && !availableTokens.length ? <div className="collateral-warning"><CircleAlert size={19} /><div><strong>{selectedAssetHasPledgedToken ? 'This asset’s token position is already pledged.' : 'No confirmed token position is registered for this asset.'}</strong>{!selectedAssetHasPledgedToken ? <Link href="/marketplace">Register or verify token position <ArrowRight size={14} /></Link> : null}</div></div> : null}
          {activeOnChainListing ? <div className="collateral-warning"><CircleAlert size={19} /><div><strong>Token units are held in marketplace escrow.</strong><Button type="button" variant="secondary" disabled={closeOnChain.isPending || !wallet} onClick={() => { setFormError(null); closeOnChain.mutate(); }}>{closeOnChain.isPending ? 'Closing listing…' : 'Close listing and recover units'}</Button></div></div> : null}
          {assetId && tokenId && marketValuation.isError ? <div className="collateral-warning"><CircleAlert size={19} /><div><strong>This token position needs a collateral market reference.</strong>{existingListing ? <Button type="button" variant="secondary" disabled={publishOnChain.isPending || !wallet} onClick={() => { setFormError(null); publishOnChain.mutate(); }}>{publishOnChain.isPending ? 'Publishing…' : `Publish ${existingListing.title}`}</Button> : <span>Create an open listing in Marketplace first.</span>}</div></div> : null}
          {formError ? <p className="collateral-error">{formError}</p> : null}
          <Button type="submit" className="collateral-submit-button" disabled={!assetId || !tokenId || !marketValuation.data || Boolean(activeOnChainListing) || create.isPending || !canManageCollateral}><LockKeyhole size={18} />{create.isPending ? `Waiting for ${network.chainName}…` : `Lock collateral on ${network.chainName}`}</Button>
          <p className="collateral-tip"><CircleAlert size={20} />Only confirmed token positions can be used as collateral. The selected asset will be locked on {network.chainName}.</p>
        </form>
      </section>
      <section className="collateral-assets" aria-labelledby="your-assets-heading"><header><div><h2 id="your-assets-heading">Your assets</h2><p>Select an asset to pledge as collateral. Only released assets can be used.</p></div><div className="collateral-tools"><label><Search size={17} /><input value={assetSearch} onChange={(event) => setAssetSearch(event.target.value)} placeholder="Search assets…" /></label><select value={assetFilter} onChange={(event) => setAssetFilter(event.target.value as typeof assetFilter)}><option value="ALL">All assets</option><option value="AVAILABLE">Available</option><option value="PLEDGED">Pledged</option></select><ChevronDown size={15} /></div></header>
        <div className="collateral-assets__list">{assets.isLoading ? <p className="collateral-empty">Loading your assets…</p> : null}{!assets.isLoading && !assetRows.length ? <p className="collateral-empty">No assets match this filter.</p> : null}{assetRows.map(({ asset, token, collateral: item }) => <AssetRow key={asset.id} asset={asset} token={token} collateral={item} selected={assetId === asset.id} onSelect={() => { setAssetId(asset.id); setTokenId(token?.id ?? ''); document.getElementById('collateral-token')?.focus(); }} />)}</div>
      </section>
    </div>{actionError ? <p className="collateral-error">{actionError}</p> : null}
  </div>;
}

function AssetRow({ asset, token, collateral, selected, onSelect }: { asset: HydratedAsset; token?: TokenOption; collateral?: CollateralRow; selected: boolean; onSelect: () => void }) {
  const released = !collateral; const supply = token?.supply ?? 0; const available = collateral?.lockedTokenUnits != null ? Math.max(0, supply - collateral.lockedTokenUnits) : supply; const value = collateral?.marketValuation?.assetValueUsd ?? asset.latestValuation?.payload.amount ?? 0;
  return <article className={selected ? 'collateral-asset-row is-selected' : 'collateral-asset-row'}><div className="collateral-asset-image" role={asset.primaryImageUrl ? 'img' : undefined} aria-label={asset.primaryImageUrl ? `${asset.name} preview` : undefined} style={asset.primaryImageUrl ? { backgroundImage: `url(${asset.primaryImageUrl})` } : undefined}>{!asset.primaryImageUrl ? <Building2 size={26} /> : null}</div><div className="collateral-asset-main"><div><h3>{asset.name}</h3><span>{asset.assetClass.replaceAll('_', ' ')}</span><em className={released ? 'is-released' : ''}>{released ? 'Released' : collateral?.status.replaceAll('_', ' ')}</em></div><p>pledged {money(collateral?.pledgedValue ?? 0, collateral?.currency ?? 'USD')} · collateral {collateral?.collateralBps != null ? `${(collateral.collateralBps / 100).toFixed(2)}%` : '10.00%'} · {supply.toLocaleString()} ERC-1155 units</p><p>utilized {money(collateral?.utilizedAmount ?? 0, collateral?.currency ?? 'USD')} · available {money(collateral?.availableAmount ?? collateral?.advanceableValue ?? 0, collateral?.currency ?? 'USD')} · token {token?.status === 'CONFIRMED' ? 'LIVE' : 'PENDING'}</p><div className="collateral-valuation"><strong>Tokenized collateral reference {value ? money(value, 'USD') : 'Pending'}</strong><span>{collateral?.marketValuation ? `${money(collateral.marketValuation.pricePerTokenUsd, 'USD')} per ERC-1155 unit · ${collateral.marketValuation.sourceLabel}` : 'Select this asset to confirm its tokenized collateral reference.'}</span></div></div><div className="collateral-asset-stats"><div><small>Total Supply</small><strong>{supply.toLocaleString()}</strong></div><div><small>Unit Price</small><strong>{collateral?.marketValuation ? money(collateral.marketValuation.pricePerTokenUsd, 'USD') : '—'}</strong></div><div><small>Available Units</small><strong>{available.toLocaleString()}</strong></div><button type="button" onClick={onSelect}>{selected ? 'Selected' : 'View details'} <ArrowRight size={15} /></button></div></article>;
}
