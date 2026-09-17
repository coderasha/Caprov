'use client';

import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { lockCollateralOnSepolia } from '@/lib/sepolia-marketplace';
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

  const canManageCollateral =
    roles.includes('ORG_ADMIN') || roles.includes('ANALYST') || roles.includes('PLATFORM_ADMIN');

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

  const availableTokens = useMemo(
    () =>
      (tokens.data ?? []).filter(
        (token) =>
          (!assetId || token.assetId === assetId) && !pledgedTokenIds.has(token.id),
      ),
    [tokens.data, assetId, pledgedTokenIds],
  );

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['collateral'] });
    await queryClient.invalidateQueries({ queryKey: ['lending'] });
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!selectedToken || previewUnits < 1) throw new Error('Choose a percentage that locks at least one ERC-1155 unit.');
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

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Collateral"
        title="Pledge DNA-backed assets"
        description="Submit assets or tokenized positions for bank review. Approvers can inspect valuation details before activating collateral for lending."
      />
      <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <Card className="p-6">
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
                {previewUnits.toLocaleString()} ERC-1155 units will be locked in the Sepolia vault. The banker applies the haircut and loan limit during underwriting.
              </p>
            ) : null}
            {assetId && tokenId && marketValuation.isError ? (
              <p className="text-sm text-amber-800">
                This token position has no collateral reference yet. Publish an on-chain CAP listing to establish its initial USD price, or settle a CAP trade.
              </p>
            ) : null}
            {formError ? <p className="text-sm text-red-700">{formError}</p> : null}
            <Button type="submit" disabled={!assetId || !tokenId || !marketValuation.data || create.isPending || !canManageCollateral}>
              {create.isPending ? 'Waiting for Sepolia confirmation…' : 'Lock collateral on Sepolia'}
            </Button>
          </form>
        </Card>

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
                </div>
                <Badge>{item.status}</Badge>
              </div>

              {item.status === 'PENDING_APPROVAL' ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <p className="text-sm text-[var(--muted)]">Locked on Sepolia and awaiting a bank loan offer.</p>
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
