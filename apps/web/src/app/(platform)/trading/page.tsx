'use client';

import { PageHeader } from '@/components/layout/page-header';
import { useWallet } from '@/components/wallet/wallet-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import { api } from '@/lib/api';
import { formatUnits, requestPurchase } from '@/lib/sepolia-marketplace';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useMemo, useState } from 'react';

interface Listing { id: string; title: string; status: string; listerWalletAddress?: string; onChainListingId?: string; availableTokenUnits?: number; totalTokenSupply?: number; pricePerTokenWei?: string; asset?: { name: string } | null; }
interface Trade { id: string; status: string; quantityBps: number; notional: number; currency: string; tokenUnits?: number; onChainPurchaseId?: string; asset?: { name: string } | null; }

export default function TradingPage() {
  const client = useQueryClient();
  const { address: wallet } = useWallet();
  const [listingId, setListingId] = useState('');
  const [bps, setBps] = useState('100');
  const market = useQuery({ queryKey: ['marketplace'], queryFn: async () => (await api.get<{ listings: Listing[] }>('/marketplace')).data.listings });
  const trades = useQuery({ queryKey: ['trading'], queryFn: async () => (await api.get<{ trades: Trade[] }>('/trading')).data.trades });
  const listings = useMemo(() => (market.data ?? []).filter((item) => item.status !== 'CLOSED' && item.onChainListingId && item.pricePerTokenWei && item.availableTokenUnits && item.listerWalletAddress?.toLowerCase() !== wallet?.toLowerCase()), [market.data, wallet]);
  const selected = listings.find((item) => item.id === listingId);
  const units = selected ? Math.floor((Number(selected.totalTokenSupply ?? selected.availableTokenUnits) * Number(bps)) / 10_000) : 0;
  const cap = selected && units > 0 ? formatUnits(BigInt(selected.pricePerTokenWei!) * BigInt(units), 18) : '0';
  const buy = useMutation({
    mutationFn: async () => {
      if (!selected || !wallet || !Number.isInteger(Number(bps)) || Number(bps) < 1 || Number(bps) > 10_000 || units < 1 || units > selected.availableTokenUnits!) throw new Error('Enter a BPS amount that maps to available whole token units.');
      const quote = (await api.post<{ onChainListingId: string; pricePerTokenWei: string }>('/trading/on-chain-trades/quote', { listingId: selected.id, buyerWalletAddress: wallet, tokenUnits: units })).data;
      const purchase = await requestPurchase({ listingId: quote.onChainListingId, units: String(units), pricePerUnitWei: quote.pricePerTokenWei });
      return api.post('/trading/on-chain-trades', { listingId: selected.id, purchaseId: purchase.purchaseId, purchaseTxHash: purchase.txHash, buyerWalletAddress: purchase.buyerAddress, tokenUnits: units, paymentCapWei: purchase.paymentCAP });
    },
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ['trading'] }); await client.invalidateQueries({ queryKey: ['marketplace'] }); },
  });
  const error = axios.isAxiosError(buy.error) && typeof buy.error.response?.data?.message === 'string' ? buy.error.response.data.message : buy.error instanceof Error ? buy.error.message : '';
  return <div className="mx-auto max-w-6xl space-y-6">
    <PageHeader eyebrow="Trading" title="CAP escrow trades" description="Select a tokenized listing, set the economic interest in basis points, and escrow CAP on Sepolia." />
    {!wallet ? <p className="rounded-xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3 text-sm text-[var(--muted)]">Connect a MetaMask wallet from the top-right menu to create a CAP escrow trade.</p> : null}
    <div className="grid gap-6 lg:grid-cols-[.9fr_1.1fr]"><Card className="p-6"><h2 className="font-display text-lg font-semibold">Create buy trade</h2><form className="mt-4 grid gap-3" onSubmit={(e) => { e.preventDefault(); buy.mutate(); }}>
      <Field label="Tokenized listing"><Select value={listingId} onChange={(e) => setListingId(e.target.value)} required><option value="">Select asset</option>{listings.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.asset?.name}</option>)}</Select></Field>
      <Field label="Economic interest (BPS)"><Input type="number" min="1" max="10000" value={bps} onChange={(e) => setBps(e.target.value)} required /></Field>
      {selected ? <div className="rounded-xl bg-[var(--paper-2)] p-3 text-sm"><p>{units.toLocaleString()} ERC-1155 units ({(Number(bps) / 100).toFixed(2)}%)</p><p className="mt-1 font-medium">{cap} CAP escrowed · 1 CAP = 1 USD</p></div> : null}
      <Button type="submit" disabled={buy.isPending || !wallet || !selected}>{buy.isPending ? 'Escrowing CAP…' : 'Pay CAP & create trade'}</Button>{error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
    </form></Card><Card className="p-6"><h2 className="font-display text-lg font-semibold">My trades</h2><div className="mt-4 grid gap-3">{(trades.data ?? []).map((trade) => <div key={trade.id} className="flex justify-between gap-3 border-b border-[var(--line)] pb-3"><div><p className="font-medium">{trade.asset?.name ?? trade.id}</p><p className="text-xs text-[var(--muted)]">{trade.tokenUnits?.toLocaleString() ?? '—'} units · {(trade.quantityBps / 100).toFixed(2)}% · Trade {trade.id}</p></div><Badge>{trade.status}</Badge></div>)}</div></Card></div>
  </div>;
}
