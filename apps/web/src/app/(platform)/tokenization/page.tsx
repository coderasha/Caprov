'use client';

import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import { api } from '@/lib/api';
import { sepoliaTxExplorerUrl } from '@/lib/explorer';
import type { HydratedAsset } from '@/lib/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

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
  txHash?: string;
  explorerUrl?: string;
  asset?: { name: string } | null;
}

export default function TokenizationPage() {
  const queryClient = useQueryClient();
  const [assetId, setAssetId] = useState('');
  const [supply, setSupply] = useState('1000000');
  const [recipient, setRecipient] = useState('');
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
    mutationFn: async () =>
      api.post('/tokenization/tokens', {
        assetId,
        supply: Number(supply),
        recipientAddress: recipient || undefined,
      }),
    onSuccess: async () => {
      setAssetId('');
      await queryClient.invalidateQueries({ queryKey: ['tokenization'] });
    },
  });

  const status = network.data ?? query.data?.network;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Tokenization"
        title="Ethereum Sepolia asset tokens"
        description="Mint Caprov economic units on Ethereum Sepolia for any supported asset class. Minting requires ETHEREUM_SEPOLIA_PRIVATE_KEY and ETHEREUM_TOKEN_CONTRACT; simulated mints are disabled."
      />
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">
              {status?.chainName ?? 'Ethereum Sepolia'}
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
                  <option key={asset.id} value={asset.id}>
                    {asset.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Supply">
              <Input value={supply} onChange={(e) => setSupply(e.target.value)} required />
            </Field>
            <Field label="Recipient (optional Sepolia address)">
              <Input
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="0x…"
              />
            </Field>
            <Button type="submit" disabled={!assetId || mint.isPending || !status?.liveMintReady}>
              Mint on Sepolia
            </Button>
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
