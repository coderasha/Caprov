'use client';

import { useWallet } from '@/components/wallet/wallet-provider';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { approveSettlement, connectSepoliaWallet } from '@/lib/sepolia-marketplace';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { ArrowLeftRight, ArrowRight, Building2, CalendarDays, Check, ChevronDown, Coins, Filter, Info, Landmark, LoaderCircle, Network, ShieldCheck, UserRound, WalletCards } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';

interface ListingRef { listerWalletAddress?: string }
interface TradeRow { id: string; status: string; notional: number; currency: string; onChainPurchaseId?: string; tokenUnits?: number; buyerWalletAddress?: string; listing?: ListingRef | null }
interface SettlementRow { id: string; tradeId: string; status: string; method: string; createdAt?: string; completedAt?: string; trade?: TradeRow | null; asset?: { name: string; assetClass?: string; primaryImageUrl?: string } | null }

const sameAddress = (left?: string, right?: string) => Boolean(left && right && left.toLowerCase() === right.toLowerCase());
const errorMessage = (error: unknown) => {
  if (axios.isAxiosError(error)) { const message = error.response?.data?.message; return Array.isArray(message) ? message.join(' ') : typeof message === 'string' ? message : 'Settlement request failed.'; }
  return error instanceof Error ? error.message : 'Settlement request failed.';
};
const shortId = (value?: string) => value ? `${value.slice(0, 9)}${value.length > 9 ? '…' : ''}` : '—';
const shortAddress = (value?: string) => value ? `${value.slice(0, 10)}…${value.slice(-5)}` : '—';
const formatDate = (value?: string) => value ? new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : 'In progress';
const assetClassLabel = (value?: string) => (value ?? 'Private asset').replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());

function StatusPill({ status }: { status: string }) { return <span className={status === 'COMPLETED' ? 'settlement-status settlement-status--complete' : 'settlement-status settlement-status--pending'}>{status === 'COMPLETED' ? 'Completed' : 'Pending'}</span>; }

export default function SettlementPage() {
  const queryClient = useQueryClient();
  const { address: wallet = '', network } = useWallet();
  const [tradeId, setTradeId] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'COMPLETED' | 'PENDING'>('ALL');
  const [settlingId, setSettlingId] = useState<string>();
  const [notice, setNotice] = useState<{ tone: 'ok' | 'danger'; text: string }>();
  const settlements = useQuery({ queryKey: ['settlement'], queryFn: async () => (await api.get<SettlementRow[]>('/settlement')).data });
  const trading = useQuery({ queryKey: ['trading'], queryFn: async () => (await api.get<{ trades: TradeRow[] }>('/trading')).data });
  const sellerTrades = useMemo(() => (trading.data?.trades ?? []).filter((trade) => trade.status === 'PENDING_SETTLEMENT' && Boolean(trade.onChainPurchaseId) && sameAddress(trade.listing?.listerWalletAddress, wallet)), [trading.data, wallet]);
  // A buyer-created CAP escrow trade does not have a SettlementRecord until
  // the seller starts the settlement. Keep it visible to the listing org in
  // the queue so an org admin can find its trade ID before connecting the
  // exact listing wallet required for on-chain approval.
  const awaitingSettlementTrades = useMemo(() => {
    const settlementTradeIds = new Set((settlements.data ?? []).map((item) => item.tradeId));
    return (trading.data?.trades ?? []).filter((trade) =>
      trade.status === 'PENDING_SETTLEMENT' &&
      Boolean(trade.onChainPurchaseId) &&
      Boolean(trade.listing?.listerWalletAddress) &&
      !settlementTradeIds.has(trade.id),
    );
  }, [settlements.data, trading.data]);
  const selectedTrade = sellerTrades.find((trade) => trade.id === tradeId);
  const visibleSettlements = useMemo(() => (settlements.data ?? []).filter((item) => filter === 'ALL' || item.status === filter), [filter, settlements.data]);
  const refresh = async () => { await queryClient.invalidateQueries({ queryKey: ['settlement'] }); await queryClient.invalidateQueries({ queryKey: ['trading'] }); };
  const create = useMutation({ mutationFn: async () => api.post('/settlement', { tradeId, method: 'TOKENIZED_TRANSFER', sellerWalletAddress: wallet }), onSuccess: async () => { setTradeId(''); setNotice({ tone: 'ok', text: 'Settlement created. Approve it from the listing wallet to release CAP and asset units atomically.' }); await refresh(); }, onError: (error) => setNotice({ tone: 'danger', text: errorMessage(error) }) });
  const settle = useMutation({
    mutationFn: async (item: SettlementRow) => { if (!item.trade?.onChainPurchaseId) throw new Error(`This settlement is not linked to a ${network.chainName} CAP escrow purchase.`); const expectedSeller = item.trade.listing?.listerWalletAddress; if (!wallet) throw new Error('Connect the listing wallet from the top-right menu before approving settlement.'); const signingWallet = await connectSepoliaWallet(); if (!sameAddress(expectedSeller, signingWallet)) throw new Error(`Settlement must be approved by the listing wallet ${expectedSeller}. Select that account in MetaMask and try again.`); const receipt = await approveSettlement(item.trade.onChainPurchaseId); return api.post(`/settlement/${item.id}/complete`, { settlementTxHash: receipt.hash }); },
    onSuccess: async () => { setNotice({ tone: 'ok', text: `Settlement confirmed on ${network.chainName}: CAP was released to the seller and ERC-1155 units transferred to the buyer.` }); await refresh(); }, onError: (error) => setNotice({ tone: 'danger', text: errorMessage(error) }), onSettled: () => setSettlingId(undefined),
  });
  return <div className="settlement-page mx-auto w-full max-w-[1480px]">
    <section className="settlement-intro"><p className="settlement-eyebrow">Settlement</p><h1>Trade settlement</h1><p>The buyer has already escrowed CAP. Only the listing wallet can approve the atomic {network.chainName} release of CAP and ERC-1155 units.</p></section>
    {notice ? <div role="status" className={notice.tone === 'ok' ? 'settlement-notice settlement-notice--ok' : 'settlement-notice settlement-notice--danger'}>{notice.text}</div> : null}
    <div className="settlement-layout">
      <section className="settlement-create" aria-labelledby="create-settlement-heading">
        <div className="settlement-create__heading"><span className="settlement-icon settlement-icon--gold"><Coins size={27} strokeWidth={1.6} /></span><div><h2 id="create-settlement-heading">Create settlement</h2><p>Available only to the MetaMask account that created the listing.<br className="hidden xl:block" /> The next step is the seller&apos;s on-chain approval.</p></div></div>
        <form className="settlement-form" onSubmit={(event) => { event.preventDefault(); setNotice(undefined); create.mutate(); }}>
          <label htmlFor="settlement-trade">CAP-escrow trade</label><div className="settlement-select-wrap"><ArrowLeftRight size={18} aria-hidden="true" /><Select id="settlement-trade" value={tradeId} onChange={(event) => setTradeId(event.target.value)} required disabled={!wallet} className="settlement-select"><option value="">{wallet ? 'Select trade' : 'Connect the listing MetaMask wallet first'}</option>{sellerTrades.map((trade) => <option key={trade.id} value={trade.id}>{trade.id} · {trade.tokenUnits?.toLocaleString() ?? 0} units · {money(trade.notional, trade.currency)}</option>)}</Select></div>
          {wallet && !sellerTrades.length ? <p className="settlement-empty"><Info size={20} /> No pending CAP-escrow trades belong to this selected listing wallet.</p> : null}
          <div className="settlement-trade-info"><p><strong>Trade information</strong> <span>(from selected trade)</span></p><div className="settlement-metrics"><Metric icon={<Landmark />} label="Asset" value={selectedTrade ? 'Selected trade' : '—'} /><Metric icon={<UserRound />} label="Buyer" value={selectedTrade?.buyerWalletAddress ? shortAddress(selectedTrade.buyerWalletAddress) : '—'} /><Metric icon={<Coins />} label="Units" value={selectedTrade?.tokenUnits?.toLocaleString() ?? '—'} /><Metric icon={<Coins />} label="Total Price" value={selectedTrade ? money(selectedTrade.notional, selectedTrade.currency) : '—'} /></div></div>
          <div className="settlement-wallets"><p>Wallet &amp; network</p><div className="settlement-wallet-row"><span className="settlement-wallet-mark settlement-wallet-mark--fox"><WalletCards size={20} /></span><span><small>Connected wallet</small><strong>{wallet ? shortAddress(wallet) : 'Not connected'}</strong></span><em className={wallet ? 'is-live' : ''}>{wallet ? 'Connected' : 'Connect'}</em></div><div className="settlement-wallet-row"><span className="settlement-wallet-mark"><Network size={19} /></span><span><small>Network</small><strong>{network.chainName}</strong></span><em className="is-live">Active</em></div></div>
          <Button type="submit" variant="ink" className="settlement-submit" disabled={!tradeId || create.isPending}>{create.isPending ? <LoaderCircle className="animate-spin" size={18} /> : null}{create.isPending ? 'Creating settlement…' : 'Create settlement'}<ArrowRight size={19} /></Button>
        </form>
      </section>
      <section className="settlement-history" aria-labelledby="settlement-history-heading"><div className="settlement-history__header"><div><h2 id="settlement-history-heading">Settlement history</h2><p>Buyer trades awaiting settlement, plus completed and in-progress settlements for your listings.</p></div><label className="settlement-filter"><Filter size={17} /><span className="sr-only">Filter settlements</span><select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}><option value="ALL">All settlements</option><option value="PENDING">Pending</option><option value="COMPLETED">Completed</option></select><ChevronDown size={16} /></label></div><div className="settlement-history__list">{settlements.isLoading || trading.isLoading ? <p className="settlement-loading"><LoaderCircle className="animate-spin" size={19} /> Loading settlements…</p> : null}{!settlements.isLoading && !trading.isLoading && !visibleSettlements.length && !(filter !== 'COMPLETED' && awaitingSettlementTrades.length) ? <p className="settlement-loading">No settlements match this filter.</p> : null}{filter !== 'COMPLETED' ? awaitingSettlementTrades.map((trade) => <AwaitingSettlementTradeCard key={trade.id} trade={trade} wallet={wallet} />) : null}{visibleSettlements.map((item) => <SettlementCard key={item.id} item={item} wallet={wallet} networkName={network.chainName} settlingId={settlingId} isPending={settle.isPending} onSettle={() => { setNotice(undefined); setSettlingId(item.id); settle.mutate(item); }} />)}</div></section>
    </div>
  </div>;
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) { return <div><span>{icon}</span><small>{label}</small><strong>{value}</strong></div>; }
function AwaitingSettlementTradeCard({ trade, wallet }: { trade: TradeRow; wallet: string }) {
  const listingWallet = trade.listing?.listerWalletAddress;
  const canSettle = sameAddress(listingWallet, wallet);
  return <article className="settlement-card"><div className="settlement-card__top"><div className="settlement-asset-image"><Building2 size={27} /></div><div className="settlement-card__details"><div className="settlement-card__title"><h3>Buyer trade awaiting settlement</h3><span>CAP escrow</span></div><div className="settlement-card__terms"><span>{trade.tokenUnits?.toLocaleString() ?? 0} ERC-1155 units</span><i /> <span>{money(trade.notional, trade.currency)}</span></div><dl><div><dt>Trade ID</dt><dd title={trade.id}>{trade.id}</dd></div><div><dt>Listing wallet</dt><dd>{shortAddress(listingWallet)}</dd></div></dl></div><div className="settlement-card__actions"><StatusPill status="PENDING" /><button type="button" className="settlement-view" onClick={() => document.getElementById('settlement-trade')?.focus()}>{canSettle ? 'Start settlement' : 'View details'} <ArrowRight size={15} /></button></div></div><p className="settlement-card__footer settlement-card__footer--pending"><span><ShieldCheck size={13} /></span>{canSettle ? 'CAP is escrowed. Select this trade above to create settlement.' : 'Trade is visible to your listing organization. Connect the listing wallet to create settlement.'}</p></article>;
}
function SettlementCard({ item, wallet, networkName, settlingId, isPending, onSettle }: { item: SettlementRow; wallet: string; networkName: string; settlingId?: string; isPending: boolean; onSettle: () => void }) {
  const completed = item.status === 'COMPLETED'; const seller = sameAddress(item.trade?.listing?.listerWalletAddress, wallet); const buyer = sameAddress(item.trade?.buyerWalletAddress, wallet); const statusText = completed ? `Completed on ${networkName}. CAP has been paid to the seller and asset units transferred to the buyer.` : seller ? 'CAP is escrowed. Approve the atomic release from this listing wallet to complete settlement.' : buyer ? 'Your CAP and the seller’s asset units are secured in escrow, pending seller approval.' : 'Settlement is awaiting the listing wallet’s on-chain approval.';
  return <article className="settlement-card"><div className="settlement-card__top"><div className="settlement-asset-image" role={item.asset?.primaryImageUrl ? 'img' : undefined} aria-label={item.asset?.primaryImageUrl ? `${item.asset?.name ?? 'Asset'} preview` : undefined} style={item.asset?.primaryImageUrl ? { backgroundImage: `url(${item.asset.primaryImageUrl})` } : undefined}>{item.asset?.primaryImageUrl ? null : <Building2 size={27} />}</div><div className="settlement-card__details"><div className="settlement-card__title"><h3>{item.asset?.name ?? item.tradeId}</h3><span>{assetClassLabel(item.asset?.assetClass)}</span></div><div className="settlement-card__terms"><span>{item.trade?.tokenUnits?.toLocaleString() ?? 0} ERC-1155 units</span><i /> <span>{item.trade ? money(item.trade.notional, item.trade.currency) : `${item.method} CAP`}</span></div><dl><div><dt>Trade ID</dt><dd>{shortId(item.tradeId)}</dd></div><div><dt>Listing wallet</dt><dd>{shortAddress(item.trade?.listing?.listerWalletAddress)}</dd></div></dl></div><div className="settlement-card__actions"><StatusPill status={item.status} /><div className="settlement-date"><CalendarDays size={16} /><span>{formatDate(item.completedAt ?? item.createdAt)}</span></div>{!completed && seller ? <Button onClick={onSettle} disabled={isPending} variant="secondary" className="settlement-approve">{settlingId === item.id ? 'Confirming…' : 'Approve & settle'} <ArrowRight size={15} /></Button> : <button type="button" className="settlement-view" onClick={() => document.getElementById('settlement-trade')?.focus()}>View details <ArrowRight size={15} /></button>}</div></div><p className={completed ? 'settlement-card__footer' : 'settlement-card__footer settlement-card__footer--pending'}><span>{completed ? <Check size={13} /> : <ShieldCheck size={13} />}</span>{statusText}</p></article>;
}
