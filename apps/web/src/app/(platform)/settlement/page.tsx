'use client';

import { PageHeader } from '@/components/layout/page-header';
import { useWallet } from '@/components/wallet/wallet-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Select } from '@/components/ui/input';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { approveSettlement, connectSepoliaWallet } from '@/lib/sepolia-marketplace';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useMemo, useState } from 'react';

interface ListingRef { listerWalletAddress?: string }
interface TradeRow { id: string; status: string; notional: number; currency: string; onChainPurchaseId?: string; tokenUnits?: number; buyerWalletAddress?: string; listing?: ListingRef | null }
interface SettlementRow { id: string; tradeId: string; status: string; method: string; trade?: TradeRow | null; asset?: { name: string } | null }

const sameAddress = (left?: string, right?: string) => Boolean(left && right && left.toLowerCase() === right.toLowerCase());
const errorMessage = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;
    return Array.isArray(message) ? message.join(' ') : typeof message === 'string' ? message : 'Settlement request failed.';
  }
  return error instanceof Error ? error.message : 'Settlement request failed.';
};

export default function SettlementPage() {
  const queryClient = useQueryClient();
  const { address: wallet = '' } = useWallet();
  const [tradeId, setTradeId] = useState('');
  const [settlingId, setSettlingId] = useState<string>();
  const [notice, setNotice] = useState<{ tone: 'ok' | 'danger'; text: string }>();
  const settlements = useQuery({ queryKey: ['settlement'], queryFn: async () => (await api.get<SettlementRow[]>('/settlement')).data });
  const trading = useQuery({ queryKey: ['trading'], queryFn: async () => (await api.get<{ trades: TradeRow[] }>('/trading')).data });
  const sellerTrades = useMemo(() => (trading.data?.trades ?? []).filter((trade) => trade.status === 'PENDING_SETTLEMENT' && Boolean(trade.onChainPurchaseId) && sameAddress(trade.listing?.listerWalletAddress, wallet)), [trading.data, wallet]);
  const refresh = async () => { await queryClient.invalidateQueries({ queryKey: ['settlement'] }); await queryClient.invalidateQueries({ queryKey: ['trading'] }); };
  const create = useMutation({
    mutationFn: async () => api.post('/settlement', { tradeId, method: 'TOKENIZED_TRANSFER', sellerWalletAddress: wallet }),
    onSuccess: async () => { setTradeId(''); setNotice({ tone: 'ok', text: 'Settlement created. Approve it below from the listing wallet to release CAP and asset units atomically.' }); await refresh(); },
    onError: (error) => setNotice({ tone: 'danger', text: errorMessage(error) }),
  });
  const settle = useMutation({
    mutationFn: async (item: SettlementRow) => {
      if (!item.trade?.onChainPurchaseId) throw new Error('This settlement is not linked to a Sepolia CAP escrow purchase.');
      const expectedSeller = item.trade.listing?.listerWalletAddress;
      if (!wallet) throw new Error('Connect the listing wallet from the top-right menu before approving settlement.');
      const signingWallet = await connectSepoliaWallet();
      if (!sameAddress(expectedSeller, signingWallet)) {
        throw new Error(`Settlement must be approved by the listing wallet ${expectedSeller}. Select that account in MetaMask and try again.`);
      }
      const receipt = await approveSettlement(item.trade.onChainPurchaseId);
      return api.post(`/settlement/${item.id}/complete`, { settlementTxHash: receipt.hash });
    },
    onSuccess: async () => { setNotice({ tone: 'ok', text: 'Settlement confirmed on Sepolia: CAP was released to the seller and ERC-1155 units transferred to the buyer.' }); await refresh(); },
    onError: (error) => setNotice({ tone: 'danger', text: errorMessage(error) }),
    onSettled: () => setSettlingId(undefined),
  });

  return <div className="mx-auto max-w-6xl space-y-6">
    <PageHeader eyebrow="Settlement" title="Trade settlement" description="The buyer has already escrowed CAP. Only the listing wallet can approve the atomic Sepolia release of CAP and ERC-1155 units." />
    {!wallet ? <p className="rounded-xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3 text-sm text-[var(--muted)]">Connect the listing MetaMask wallet from the top-right menu to create or approve settlement.</p> : null}
    {notice ? <div role="status" className={notice.tone === 'ok' ? 'rounded-2xl border border-[var(--ok)]/25 bg-[var(--ok-soft)] px-4 py-3 text-sm text-[var(--ok)]' : 'rounded-2xl border border-[var(--danger)]/25 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]'}>{notice.text}</div> : null}
    <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
      <Card className="p-6">
        <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">Create settlement</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">Available only to the MetaMask account that created the listing. The next step is the seller’s on-chain approval.</p>
        <form className="mt-4 grid gap-3" onSubmit={(event) => { event.preventDefault(); setNotice(undefined); create.mutate(); }}>
          <Field label="CAP-escrow trade"><Select value={tradeId} onChange={(e) => setTradeId(e.target.value)} required disabled={!wallet}><option value="">{wallet ? 'Select trade' : 'Connect the listing MetaMask wallet first'}</option>{sellerTrades.map((trade) => <option key={trade.id} value={trade.id}>{trade.id} · {trade.tokenUnits?.toLocaleString() ?? 0} units · {money(trade.notional, trade.currency)}</option>)}</Select></Field>
          {wallet && !sellerTrades.length ? <p className="text-xs text-[var(--muted)]">No pending CAP-escrow trades belong to this selected listing wallet.</p> : null}
          <Button type="submit" disabled={!tradeId || create.isPending}>{create.isPending ? 'Creating…' : 'Create settlement'}</Button>
        </form>
      </Card>
      <div className="grid gap-4">
        {settlements.isLoading ? <Card className="p-6 text-sm text-[var(--muted)]">Loading settlements…</Card> : null}
        {!settlements.isLoading && !(settlements.data ?? []).length ? <Card className="p-6 text-sm text-[var(--muted)]">No settlements yet.</Card> : null}
        {(settlements.data ?? []).map((item) => {
          const seller = sameAddress(item.trade?.listing?.listerWalletAddress, wallet);
          const buyer = sameAddress(item.trade?.buyerWalletAddress, wallet);
          const completed = item.status === 'COMPLETED';
          return <Card key={item.id} className="p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-display text-lg font-semibold tracking-[-0.02em]">{item.asset?.name ?? item.tradeId}</h2><p className="mt-1 text-sm text-[var(--muted)]">{item.trade?.tokenUnits?.toLocaleString() ?? 0} ERC-1155 units · {item.trade ? money(item.trade.notional, item.trade.currency) : item.method} CAP</p><p className="mt-1 text-xs text-[var(--muted)]">Trade {item.tradeId}{item.trade?.onChainPurchaseId ? ` · Sepolia purchase #${item.trade.onChainPurchaseId}` : ''}</p>{item.trade?.listing?.listerWalletAddress ? <p className="mt-1 font-mono text-xs text-[var(--muted)]">Listing wallet: {item.trade.listing.listerWalletAddress}</p> : null}</div><Badge>{item.status}</Badge></div>
            {completed ? <p className="mt-4 text-sm text-[var(--ok)]">Completed on Sepolia. CAP has been paid to the seller and asset units transferred to the buyer.</p> : seller ? <div className="mt-4"><p className="text-sm text-[var(--muted)]">Approve from this listing wallet to atomically release escrowed CAP and ERC-1155 units for this trade only.</p><Button className="mt-3" onClick={() => { setNotice(undefined); setSettlingId(item.id); settle.mutate(item); }} disabled={settle.isPending}>{settlingId === item.id ? 'Confirming selected trade…' : 'Approve & settle on Sepolia'}</Button></div> : buyer ? <p className="mt-4 text-sm text-[var(--muted)]">Your CAP and the seller’s units are held in escrow. Waiting for the seller’s on-chain approval.</p> : <p className="mt-4 text-sm text-[var(--muted)]">Connect the listing wallet to approve this settlement, or the buyer wallet to view its escrow status.</p>}
          </Card>;
        })}
      </div>
    </div>
  </div>;
}
