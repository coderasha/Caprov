'use client';

import { useWallet } from '@/components/wallet/wallet-provider';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { api } from '@/lib/api';
import { sepoliaTxExplorerUrl } from '@/lib/explorer';
import type { HydratedAsset } from '@/lib/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, Building2, Check, Copy, ExternalLink, Landmark, LoaderCircle, Network, PackageCheck, ShieldCheck, WalletCards } from 'lucide-react';

interface NetworkStatus { chainId: number; chainName: string; mode: string; liveMintReady: boolean; message: string; contractAddress?: string; rpcProbe?: { ok: boolean; chainId?: number; error?: string } }
interface TokenRow { id: string; status: string; mode: string; chainName: string; supply: number; recipientAddress: string; contractAddress?: string; txHash?: string; explorerUrl?: string; createdAt?: string; asset?: { id: string; name: string; assetClass?: string; primaryImageUrl?: string } | null }

const abbreviate = (value?: string, start = 10, end = 5) => value ? `${value.slice(0, start)}…${value.slice(-end)}` : 'Not configured';
const classLabel = (value?: string) => (value ?? 'Private asset').replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
const formatDate = (value?: string) => value ? new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';

export default function TokenizationPage() {
  const queryClient = useQueryClient();
  const { address: wallet, network: selectedNetwork } = useWallet();
  const [assetId, setAssetId] = useState('');
  const [supply, setSupply] = useState('1000000');
  const [copyMessage, setCopyMessage] = useState('');
  const query = useQuery({ queryKey: ['tokenization', 'overview'], queryFn: async () => (await api.get<{ network: NetworkStatus; tokens: TokenRow[] }>('/tokenization')).data });
  const network = useQuery({ queryKey: ['tokenization-network'], queryFn: async () => (await api.get<NetworkStatus>('/tokenization/network')).data });
  const assets = useQuery({ queryKey: ['assets'], queryFn: async () => (await api.get<HydratedAsset[]>('/assets')).data });
  const status = network.data ?? query.data?.network;
  const activeContract = status?.contractAddress?.toLowerCase();
  const existingTokens = query.data?.tokens ?? [];
  const tokenizedAssetIdSet = useMemo(() => new Set(existingTokens.filter((token) => token.status === 'CONFIRMED' && token.contractAddress?.toLowerCase() === activeContract).map((token) => token.asset?.id).filter((id): id is string => Boolean(id))), [activeContract, existingTokens]);
  const selectedAsset = (assets.data ?? []).find((asset) => asset.id === assetId);
  const selectedToken = existingTokens.find((token) => token.asset?.id === assetId && token.contractAddress?.toLowerCase() === activeContract);
  const previewToken = selectedToken ?? existingTokens[0];
  const previewAsset = selectedAsset ?? (assets.data ?? []).find((asset) => asset.id === previewToken?.asset?.id) ?? null;
  const copy = async (value?: string) => { if (!value || !navigator.clipboard) return; await navigator.clipboard.writeText(value); setCopyMessage('Copied'); window.setTimeout(() => setCopyMessage(''), 1500); };
  const mint = useMutation({
    mutationFn: async () => { if (!wallet) throw new Error('Connect the recipient MetaMask wallet from the top-right menu before minting.'); if (!status?.contractAddress) throw new Error('The active network ERC-1155 asset-token contract is not configured.'); return api.post('/tokenization/tokens', { assetId, supply: Number(supply), recipientAddress: wallet }); },
    onSuccess: async () => { setAssetId(''); await queryClient.invalidateQueries({ queryKey: ['tokenization'] }); },
  });
  const recipient = wallet ?? previewToken?.recipientAddress;
  const explorerUrl = previewToken && sepoliaTxExplorerUrl(previewToken.txHash ?? previewToken.explorerUrl);

  return <div className="tokenization-page mx-auto w-full max-w-[1480px]">
    <section className="tokenization-hero"><div className="tokenization-hero__copy"><p className="tokenization-eyebrow">Tokenization</p><h1>{selectedNetwork.chainName} asset tokens</h1><p>Mint Caprov economic units on {selectedNetwork.chainName} for any supported asset class using the MetaMask wallet connected from the top-right menu. Assets do not need to be listed first.</p></div><div className="tokenization-hero__quote">Turn real-world<br />assets into digital<br />tokens.<i /></div></section>
    <div className="tokenization-benefits"><Benefit icon={<Landmark />} title="Multiple asset classes" text="Real estate, credit, equity & more" /><Benefit icon={<ShieldCheck />} title="Secure & transparent" text="On-chain minting via Besu" /><Benefit icon={<WalletCards />} title="MetaMask integration" text="Use your connected wallet" /><Benefit icon={<Network />} title="Institution-grade" text="Permissioned local network" /></div>
    <section className="tokenization-network" aria-label="Network status"><span className="tokenization-network__icon"><Network size={29} /></span><div><h2>{status?.chainName ?? selectedNetwork.chainName}</h2><p>{status?.message ?? 'Checking minting network configuration…'}</p><small>Chain ID: {status?.chainId ?? '—'} <i /> Contract: {abbreviate(status?.contractAddress, 13, 9)} <i /> RPC: {status?.rpcProbe?.ok ? 'ok' : status?.rpcProbe?.error ?? 'checking'}</small></div><span className={status?.liveMintReady ? 'tokenization-live' : 'tokenization-live tokenization-live--offline'}><b /> {status?.liveMintReady ? 'Live' : 'Setup required'}</span></section>
    <div className="tokenization-layout">
      <section className="tokenization-mint" aria-labelledby="mint-token-heading"><h2 id="mint-token-heading">Mint token</h2><p>Tokenization is available for real estate, private credit, private equity, infrastructure, aviation, art, agriculture, funds, and other asset types.</p>
        <form onSubmit={(event) => { event.preventDefault(); mint.mutate(); }}>
          <label htmlFor="token-asset">Asset <b>*</b></label><div className="tokenization-field tokenization-field--select"><Landmark size={20} /><Select id="token-asset" value={assetId} onChange={(event) => setAssetId(event.target.value)} required><option value="">Select an asset</option>{(assets.data ?? []).map((asset) => <option key={asset.id} value={asset.id} disabled={tokenizedAssetIdSet.has(asset.id)}>{asset.name}{tokenizedAssetIdSet.has(asset.id) ? ' · already tokenized' : ''}</option>)}</Select></div><small>Select the asset you want to tokenize.</small>
          <label htmlFor="token-supply">Supply <b>*</b></label><div className="tokenization-field"><PackageCheck size={20} /><Input id="token-supply" inputMode="numeric" value={supply} onChange={(event) => setSupply(event.target.value.replace(/[^0-9]/g, ''))} required /></div><small>Total number of tokens to be minted.</small>
          <div className="tokenization-recipient"><WalletCards size={22} /><span>Mint recipient: <strong>{recipient ? abbreviate(recipient) : 'Connect MetaMask wallet'}</strong></span>{recipient ? <button type="button" onClick={() => copy(recipient)} aria-label="Copy recipient wallet"><Copy size={17} /></button> : null}</div>
          {selectedToken ? <p className="tokenization-existing">This asset is already tokenized with an immutable supply of {selectedToken.supply.toLocaleString()} units.</p> : null}
          <Button type="submit" variant="ink" className="tokenization-submit" disabled={!assetId || tokenizedAssetIdSet.has(assetId) || mint.isPending || !wallet || !status?.contractAddress}>{mint.isPending ? <LoaderCircle className="animate-spin" size={18} /> : <PackageCheck size={19} />}{mint.isPending ? 'Minting token…' : `Mint on ${selectedNetwork.chainName}`}<ArrowRight size={19} /></Button>
          {mint.error ? <p className="tokenization-error">{axios.isAxiosError(mint.error) ? String(mint.error.response?.data?.message ?? 'Minting failed.') : mint.error instanceof Error ? mint.error.message : 'Minting failed.'}</p> : null}
        </form>
      </section>
      <section className="tokenization-preview" aria-labelledby="asset-preview-heading"><div className="tokenization-preview__header"><h2 id="asset-preview-heading">Asset preview</h2><span>{previewToken?.status === 'CONFIRMED' ? 'Confirmed / live' : 'Ready to mint'}</span></div>
        <div className="tokenization-asset-card"><div className="tokenization-asset-image" role={previewAsset?.primaryImageUrl ? 'img' : undefined} aria-label={previewAsset?.primaryImageUrl ? `${previewAsset.name} preview` : undefined} style={previewAsset?.primaryImageUrl ? { backgroundImage: `url(${previewAsset.primaryImageUrl})` } : undefined}>{!previewAsset?.primaryImageUrl ? <Building2 size={28} /> : null}</div><div><div className="tokenization-asset-card__title"><h3>{previewAsset?.name ?? previewToken?.asset?.name ?? 'Select an asset'}</h3><span>{classLabel(previewAsset?.assetClass ?? previewToken?.asset?.assetClass)}</span>{previewToken ? <em>Tokenized</em> : null}</div><p>Supply {previewToken?.supply.toLocaleString() ?? Number(supply || 0).toLocaleString()} · {status?.chainName ?? selectedNetwork.chainName}</p><div className="tokenization-address"><span>{abbreviate(previewToken?.recipientAddress ?? wallet)}</span>{previewToken?.recipientAddress ?? wallet ? <button type="button" onClick={() => copy(previewToken?.recipientAddress ?? wallet)} aria-label="Copy wallet address"><Copy size={15} /></button> : null}</div>{explorerUrl ? <a href={explorerUrl} target="_blank" rel="noreferrer">View on transaction explorer <ExternalLink size={14} /></a> : <span className="tokenization-no-explorer">Transaction explorer available after minting</span>}</div></div>
        <dl className="tokenization-details"><Detail label="Status" icon={<Check />} value={previewToken?.status === 'CONFIRMED' ? 'Confirmed / Live' : 'Ready to mint'} good={previewToken?.status === 'CONFIRMED'} /><Detail label="Network" icon={<Network />} value={status?.chainName ?? selectedNetwork.chainName} /><Detail label="Chain ID" icon={<Network />} value={String(status?.chainId ?? '—')} /><Detail label="Contract Address" icon={<Building2 />} value={abbreviate(status?.contractAddress, 13, 9)} copyValue={status?.contractAddress} onCopy={copy} /><Detail label="Token Standard" icon={<PackageCheck />} value="CaprovAssetToken" /><Detail label="Wallet (Connected)" icon={<WalletCards />} value={abbreviate(wallet)} copyValue={wallet} onCopy={copy} /><Detail label="Last Updated" icon={<Check />} value={formatDate(previewToken?.createdAt)} /></dl>
      </section>
    </div>{copyMessage ? <span className="tokenization-toast" role="status">{copyMessage}</span> : null}
  </div>;
}

function Benefit({ icon, title, text }: { icon: ReactNode; title: string; text: string }) { return <div><span>{icon}</span><p><strong>{title}</strong><small>{text}</small></p></div>; }
function Detail({ icon, label, value, good, copyValue, onCopy }: { icon: ReactNode; label: string; value: string; good?: boolean; copyValue?: string; onCopy?: (value?: string) => void }) { return <div><dt><span>{icon}</span>{label}</dt><dd className={good ? 'is-good' : ''}>{good ? <i /> : null}{value}{copyValue && onCopy ? <button type="button" onClick={() => onCopy(copyValue)} aria-label={`Copy ${label}`}><Copy size={15} /></button> : null}</dd></div>; }
