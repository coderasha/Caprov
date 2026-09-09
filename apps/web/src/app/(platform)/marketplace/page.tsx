'use client';

import { PageHeader } from '@/components/layout/page-header';
import { WalletConnect } from '@/components/wallet-connect';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { api } from '@/lib/api';
import { readFileAsDataUrl } from '@/lib/files';
import { buyOnChainListing, closeOnChainListing, createOnChainListing, formatUnits } from '@/lib/sepolia-marketplace';
import type { HydratedAsset } from '@/lib/types';
import { useAuthStore } from '@/stores/auth-store';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import Image from 'next/image';
import { useMemo, useState } from 'react';

type Token = { id: string; assetId: string; tokenId: string; supply: number; status: string; recipientAddress: string; contractAddress?: string };
type Listing = { id: string; title: string; status: string; summary?: string; imageUrl?: string; askPrice?: number; currency?: string; assetTokenId?: string; totalTokenSupply?: number; availableTokenUnits?: number; pricePerTokenWei?: string; onChainListingId?: string; listerWalletAddress?: string; asset?: { name: string; primaryImageUrl?: string; imageUrls?: string[] } | null };
const message = (e: unknown) => axios.isAxiosError(e) && typeof e.response?.data?.message === 'string' ? e.response.data.message : e instanceof Error ? e.message : 'Could not complete the request.';

export default function MarketplacePage() {
  const client = useQueryClient();
  const canList = useAuthStore((s) => s.roles).some((role) => ['ORG_ADMIN', 'ANALYST', 'PLATFORM_ADMIN'].includes(role));
  const [wallet, setWallet] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({ assetId: '', units: '1000', supply: '1000000', price: '1', title: '', summary: '', imageUrl: '', imageName: '', tokenizeBeforeListing: true });
  const [buyUnits, setBuyUnits] = useState<Record<string, string>>({});
  const listings = useQuery({ queryKey: ['marketplace'], queryFn: async () => (await api.get<{ listings: Listing[] }>('/marketplace')).data.listings });
  const assets = useQuery({ queryKey: ['assets'], queryFn: async () => (await api.get<HydratedAsset[]>('/assets')).data });
  const tokens = useQuery({ queryKey: ['tokenization'], queryFn: async () => (await api.get<{ tokens: Token[] }>('/tokenization')).data.tokens });
  const asset = (assets.data ?? []).find((item) => item.id === form.assetId);
  const activeAssetContract = process.env.NEXT_PUBLIC_ETHEREUM_ASSET_TOKEN_CONTRACT?.toLowerCase();
  const token = (tokens.data ?? []).find((item) => item.assetId === form.assetId && item.status === 'CONFIRMED' && item.contractAddress?.toLowerCase() === activeAssetContract);
  const open = useMemo(() => (listings.data ?? []).filter((item) => ['OPEN', 'PARTIALLY_FILLED'].includes(item.status)), [listings.data]);
  const refresh = () => Promise.all([client.invalidateQueries({ queryKey: ['marketplace'] }), client.invalidateQueries({ queryKey: ['tokenization'] })]);
  const publish = useMutation({ mutationFn: async () => {
    if (!asset) throw new Error('Select an asset.');
    if (!form.tokenizeBeforeListing) {
      await api.post('/marketplace/listings', { assetId: asset.id, title: form.title || undefined, summary: form.summary || undefined, imageUrl: form.imageUrl || undefined, offeringType: 'SALE', askPrice: Number(form.price), tokenizeOnCreate: false });
      return;
    }
    if (!wallet) throw new Error('Connect the lister MetaMask wallet first.');
    let assetToken = token;
    if (!assetToken) assetToken = (await api.post<Token>('/tokenization/tokens', { assetId: asset.id, supply: Number(form.supply), recipientAddress: wallet })).data;
    if (assetToken.recipientAddress.toLowerCase() !== wallet.toLowerCase()) throw new Error('Connect the wallet holding this asset’s ERC-1155 units.');
    const escrow = await createOnChainListing({ assetTokenId: assetToken.tokenId, units: form.units, pricePerToken: form.price });
    await api.post('/marketplace/on-chain-listings', { assetId: asset.id, tokenPositionId: assetToken.id, onChainListingId: escrow.listingId, onChainTxHash: escrow.txHash, listerWalletAddress: wallet, availableTokenUnits: Number(form.units), pricePerTokenWei: escrow.pricePerTokenWei, title: form.title || undefined, summary: form.summary || undefined, imageUrl: form.imageUrl || undefined });
  }, onSuccess: async () => { setNotice(form.tokenizeBeforeListing ? 'Tokenized listing is live.' : 'Non-tokenized listing published. Tokenize it later to enable CAPROV purchases.'); await refresh(); }, onError: (e) => setNotice(message(e)) });
  const buy = useMutation({ mutationFn: async (listing: Listing) => { if (!listing.onChainListingId || !listing.pricePerTokenWei) throw new Error('This listing is not tokenized.'); await buyOnChainListing({ listingId: listing.onChainListingId, units: buyUnits[listing.id] || '1', pricePerUnitWei: listing.pricePerTokenWei }); await api.post(`/marketplace/on-chain-listings/${listing.id}/sync`); }, onSuccess: async () => { setNotice('Purchase settled in CAPROV.'); await refresh(); }, onError: (e) => setNotice(message(e)) });
  const close = useMutation({ mutationFn: async (listing: Listing) => { if (!listing.onChainListingId) return; await closeOnChainListing(listing.onChainListingId); await api.post(`/marketplace/on-chain-listings/${listing.id}/sync`); }, onSuccess: async () => { setNotice('Listing closed; unsold units returned to the lister.'); await refresh(); }, onError: (e) => setNotice(message(e)) });
  const uploadImage = async (file?: File) => { if (!file) return setForm((current) => ({ ...current, imageUrl: '', imageName: '' })); const imageUrl = await readFileAsDataUrl(file); setForm((current) => ({ ...current, imageUrl, imageName: file.name })); };

  return <div className="mx-auto max-w-6xl space-y-6">
    <PageHeader eyebrow="Marketplace" title="Asset marketplace" description="Tokenized ERC-1155 units settle atomically against CAPROV on Ethereum Sepolia." />
    <WalletConnect onConnected={setWallet} />
    {notice ? <p className="rounded-xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3 text-sm">{notice}</p> : null}
    <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
      <section className="space-y-4"><h2 className="font-display text-lg font-semibold">Marketplace listings</h2>
        {open.map((listing) => <ListingCard key={listing.id} listing={listing} units={buyUnits[listing.id] || '1'} setUnits={(units) => setBuyUnits((current) => ({ ...current, [listing.id]: units }))} onBuy={() => buy.mutate(listing)} buying={buy.isPending} canClose={wallet.toLowerCase() === listing.listerWalletAddress?.toLowerCase()} onClose={() => close.mutate(listing)} closing={close.isPending} />)}
        {!open.length ? <Card className="p-6 text-sm text-[var(--muted)]">No marketplace listings are open yet.</Card> : null}
      </section>
      <Card className="p-6"><h2 className="font-display text-lg font-semibold">Create a listing</h2><p className="mt-2 text-sm text-[var(--muted)]">Only tokenized listings can be bought with CAPROV.</p>
        {!canList ? <p className="mt-5 text-sm text-[var(--muted)]">Your role can browse and buy, but cannot list assets.</p> : <form className="mt-5 grid gap-3" onSubmit={(e) => { e.preventDefault(); setNotice(''); publish.mutate(); }}>
          <Field label="Asset"><Select required value={form.assetId} onChange={(e) => setForm((current) => ({ ...current, assetId: e.target.value }))}><option value="">Select an asset</option>{(assets.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
          <label className="flex gap-3 rounded-xl border border-[var(--line)] px-3 py-3 text-sm"><input type="checkbox" checked={form.tokenizeBeforeListing} onChange={(e) => setForm((current) => ({ ...current, tokenizeBeforeListing: e.target.checked }))} /><span><b>Tokenize before listing</b><span className="mt-1 block text-xs text-[var(--muted)]">Mint or reuse ERC-1155 units, escrow the selected quantity, and enable CAPROV purchases.</span></span></label>
          {form.tokenizeBeforeListing && (token ? <p className="text-xs text-[var(--muted)]">Existing ERC-1155 token #{token.tokenId}; supply {token.supply.toLocaleString()}.</p> : <Field label="Total token supply"><Input type="number" min="1" value={form.supply} onChange={(e) => setForm((current) => ({ ...current, supply: e.target.value }))} required /></Field>)}
          {form.tokenizeBeforeListing ? <Field label="Units available for sale"><Input type="number" min="1" value={form.units} onChange={(e) => setForm((current) => ({ ...current, units: e.target.value }))} required /></Field> : null}
          <Field label={form.tokenizeBeforeListing ? 'CAPROV per unit' : 'Indicative asking price (USD)'}><Input type="number" min="0.000000000000000001" step="any" value={form.price} onChange={(e) => setForm((current) => ({ ...current, price: e.target.value }))} required /></Field>
          <Field label="Listing image"><Input type="file" accept="image/*" onChange={(e) => void uploadImage(e.target.files?.[0])} />{form.imageName ? <p className="mt-1 text-xs text-[var(--muted)]">Selected: {form.imageName}</p> : null}</Field>
          <Field label="Listing title"><Input value={form.title} onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))} placeholder={asset ? `${asset.name} ${form.tokenizeBeforeListing ? 'token units' : ''}` : 'Optional'} /></Field>
          <Field label="Summary"><Textarea rows={3} value={form.summary} onChange={(e) => setForm((current) => ({ ...current, summary: e.target.value }))} /></Field>
          <Button type="submit" disabled={publish.isPending || !form.assetId}>{publish.isPending ? 'Publishing…' : form.tokenizeBeforeListing ? 'Tokenize and create listing' : 'Create non-tokenized listing'}</Button>
        </form>}
      </Card>
    </div>
  </div>;
}

function ListingCard({ listing, units, setUnits, onBuy, buying, canClose, onClose, closing }: { listing: Listing; units: string; setUnits: (value: string) => void; onBuy: () => void; buying: boolean; canClose: boolean; onClose: () => void; closing: boolean }) {
  const tokenized = Boolean(listing.onChainListingId && listing.pricePerTokenWei);
  const image = listing.imageUrl || listing.asset?.primaryImageUrl || listing.asset?.imageUrls?.[0] || '/file.svg';
  return <Card className="overflow-hidden"><div className="grid md:grid-cols-[180px_1fr]"><Image src={image} alt={listing.title} width={360} height={240} unoptimized className="min-h-44 h-full w-full object-cover" /><div className="p-5"><div className="flex justify-between gap-3"><div><h3 className="font-display text-lg font-semibold">{listing.title}</h3><p className="text-sm text-[var(--muted)]">{listing.asset?.name} · {tokenized ? `ERC-1155 token #${listing.assetTokenId}` : 'Not tokenized'}</p></div><Badge>{tokenized ? 'LIVE' : 'OFF-CHAIN'}</Badge></div>{listing.summary ? <p className="mt-3 text-sm text-[var(--muted)]">{listing.summary}</p> : null}{tokenized ? <><div className="mt-4 text-sm"><p><b>{Number(listing.availableTokenUnits ?? 0).toLocaleString()}</b> units available of {Number(listing.totalTokenSupply ?? 0).toLocaleString()}</p><p><b>{formatUnits(listing.pricePerTokenWei!, 18)} CAPROV</b> per unit</p></div><div className="mt-4 flex flex-wrap gap-2"><Input aria-label="Units to buy" type="number" min="1" max={listing.availableTokenUnits} value={units} onChange={(e) => setUnits(e.target.value)} className="w-32" /><Button onClick={onBuy} disabled={buying}>Buy with CAPROV</Button>{canClose ? <Button variant="secondary" onClick={onClose} disabled={closing}>Close listing</Button> : null}</div></> : <p className="mt-4 text-sm text-[var(--muted)]">Indicative asking price: {listing.askPrice ?? '—'} {listing.currency ?? 'USD'}. Tokenize to enable CAPROV settlement.</p>}</div></div></Card>;
}
