'use client';

import { PageHeader } from '@/components/layout/page-header';
import { useWallet } from '@/components/wallet/wallet-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import { api } from '@/lib/api';
import { sepoliaTxExplorerUrl } from '@/lib/explorer';
import type { HydratedAsset } from '@/lib/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import axios from 'axios';

interface NetworkStatus {
  chainId: number;
  chainName: string;
  mode: string;
  liveMintReady: boolean;
  message: string;
  contractAddress?: string;
  rpcProbe?: { ok: boolean; chainId?: number; error?: string };
}

interface TokenRow {
  id: string;
  status: string;
  mode: string;
  chainName: string;
  supply: number;
  recipientAddress: string;
  contractAddress?: string;
  txHash?: string;
  explorerUrl?: string;
  asset?: { id: string; name: string } | null;
}

export default function TokenizationPage() {
  const queryClient = useQueryClient();
  const { address: wallet, network: selectedNetwork } = useWallet();
  const [assetId, setAssetId] = useState('');
  const [supply, setSupply] = useState('1000000');
  const query = useQuery({
    queryKey: ['tokenization'],
    queryFn: async () =>
      (await api.get<{ network: NetworkStatus; tokens: TokenRow[] }>('/tokenization')).data,
  });
  const network = useQuery({
    queryKey: ['tokenization-network'],
    queryFn: async () => (await api.get<NetworkStatus>('/tokenization/network')).data,
  });
  const assets = useQuery({
    queryKey: ['assets'],
    queryFn: async () => (await api.get<HydratedAsset[]>('/assets')).data,
  });
  const mint = useMutation({
    mutationFn: async () => {
      if (!wallet) throw new Error('Connect the recipient MetaMask wallet from the top-right menu before minting.');
      if (!status?.contractAddress) throw new Error('The active network ERC-1155 asset-token contract is not configured.');
      // Minting is owner-only in CaprovAssetToken. The API's configured
      // network signer owns the contract and sends the units to this wallet.
      return api.post('/tokenization/tokens', {
        assetId,
        supply: Number(supply),
        recipientAddress: wallet,
      });
    },
    onSuccess: async () => {
      setAssetId('');
      await queryClient.invalidateQueries({ queryKey: ['tokenization'] });
    },
  });

  const status = network.data ?? query.data?.network;
  const activeContract = status?.contractAddress?.toLowerCase();
  const existingTokens = query.data?.tokens ?? [];
  const tokenizedAssetIdSet = useMemo(
    () => new Set(existingTokens
      .filter((token) => token.status === 'CONFIRMED' && token.contractAddress?.toLowerCase() === activeContract)
      .map((token) => token.asset?.id)
      .filter((id): id is string => Boolean(id))),
    [activeContract, existingTokens],
  );
  const selectedToken = existingTokens.find((token) => token.asset?.id === assetId && token.contractAddress?.toLowerCase() === activeContract);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Tokenization"
        title={`${selectedNetwork.chainName} asset tokens`}
        description={`Mint Caprov economic units on ${selectedNetwork.chainName} for any supported asset class using the MetaMask wallet connected from the top-right menu. Assets do not need to be listed first.`}
      />
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">
              {status?.chainName ?? selectedNetwork.chainName}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">{status?.message}</p>
          </div>
          <Badge>{status?.mode ?? '…'}</Badge>
        </div>
        <p className="mt-3 text-xs text-[var(--muted)]">
          chainId {status?.chainId ?? 11155111}
          {status?.contractAddress ? ` · contract ${status.contractAddress}` : ''}
          {status?.rpcProbe ? ` · rpc ${status.rpcProbe.ok ? 'ok' : status.rpcProbe.error}` : ''}
        </p>
      </Card>
      <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">Mint token</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Tokenization is available for real estate, private credit, private equity, infrastructure, aviation, art, agriculture, funds, and other asset types.
          </p>
          <form
            className="mt-4 grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              mint.mutate();
            }}
          >
            <Field label="Asset">
              <Select value={assetId} onChange={(e) => setAssetId(e.target.value)} required>
                <option value="">Select asset</option>
                {(assets.data ?? []).map((asset) => (
                  <option key={asset.id} value={asset.id} disabled={tokenizedAssetIdSet.has(asset.id)}>
                    {asset.name}{tokenizedAssetIdSet.has(asset.id) ? ' · already tokenized' : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Supply">
              <Input value={supply} onChange={(e) => setSupply(e.target.value)} required />
            </Field>
            <p className="rounded-xl border border-[var(--line)] bg-[var(--paper)] px-3 py-2 text-xs text-[var(--muted)]">
              {wallet ? `Mint recipient: ${wallet}` : 'Connect the recipient MetaMask wallet from the top-right menu.'}
            </p>
            {selectedToken ? <p className="text-sm text-[var(--muted)]">This asset is already tokenized with an immutable supply of {selectedToken.supply.toLocaleString()} units. It can be listed in Marketplace without minting again.</p> : null}
            <Button type="submit" disabled={!assetId || tokenizedAssetIdSet.has(assetId) || mint.isPending || !wallet || !status?.contractAddress}>
              Mint on {selectedNetwork.chainName}
            </Button>
            {mint.error ? <p className="text-sm text-[var(--danger)]">{axios.isAxiosError(mint.error) ? String(mint.error.response?.data?.message ?? 'Minting failed.') : mint.error instanceof Error ? mint.error.message : 'Minting failed.'}</p> : null}
          </form>
        </Card>
        <div className="grid gap-4">
          {(query.data?.tokens ?? []).map((token) => (
            <Card key={token.id} className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">
                    {token.asset?.name ?? token.id}
                  </h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    supply {token.supply.toLocaleString()} · {token.chainName}
                  </p>
                </div>
                <Badge>
                  {token.status} / {token.mode}
                </Badge>
              </div>
              <p className="mt-3 break-anywhere text-xs text-[var(--muted)]">{token.recipientAddress}</p>
              {sepoliaTxExplorerUrl(token.txHash ?? token.explorerUrl) ? (
                <a
                  className="mt-3 inline-block text-sm text-[var(--ink)] underline"
                  href={sepoliaTxExplorerUrl(token.txHash ?? token.explorerUrl)}
                  target="_blank"
                  rel="noreferrer"
                >
                  View on transaction explorer
                </a>
              ) : null}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
