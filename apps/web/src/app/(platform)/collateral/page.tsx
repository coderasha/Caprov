'use client';

import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import type { HydratedAsset } from '@/lib/types';
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
  pledgedValue: number;
  advanceableValue: number;
  utilizedAmount: number;
  availableAmount: number;
  canRelease: boolean;
  activeLoanCount: number;
  currency: string;
  haircutBps: number;
  tokenId?: string;
  asset?: { name: string } | null;
  token?: { id: string; mode: string; supply?: number } | null;
  loans?: LoanSummary[];
  valuation?: { payload: { amount: number; currency: string } } | null;
}

interface TokenOption {
  id: string;
  assetId: string;
  asset?: { name: string } | null;
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
  const [assetId, setAssetId] = useState('');
  const [tokenId, setTokenId] = useState('');
  const [haircutBps, setHaircutBps] = useState('1500');
  const [pledgedValue, setPledgedValue] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editHaircut, setEditHaircut] = useState('');
  const [editPledged, setEditPledged] = useState('');

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

  const activeAssetIds = useMemo(
    () =>
      new Set(
        (collateral.data ?? [])
          .filter((item) => item.status === 'ACTIVE')
          .map((item) => item.assetId),
      ),
    [collateral.data],
  );
  const pledgedTokenIds = useMemo(
    () =>
      new Set(
        (collateral.data ?? [])
          .filter((item) => item.status === 'ACTIVE' && item.tokenId)
          .map((item) => item.tokenId as string),
      ),
    [collateral.data],
  );

  const pledgeableAssets = useMemo(
    () => (assets.data ?? []).filter((asset) => !activeAssetIds.has(asset.id)),
    [assets.data, activeAssetIds],
  );
  const selectedAsset = (assets.data ?? []).find((asset) => asset.id === assetId);
  const markAmount = selectedAsset?.latestValuation?.payload.amount;
  const markCurrency = selectedAsset?.latestValuation?.payload.currency ?? selectedAsset?.currency;
  const previewPledged = Number(pledgedValue || markAmount || 0);
  const previewHaircut = Number(haircutBps || 0);
  const previewAdvanceable =
    previewPledged > 0
      ? Number((previewPledged * (1 - previewHaircut / 10_000)).toFixed(2))
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
    mutationFn: async () =>
      api.post('/collateral', {
        assetId,
        tokenId: tokenId || undefined,
        haircutBps: Number(haircutBps),
        pledgedValue: pledgedValue ? Number(pledgedValue) : undefined,
      }),
    onSuccess: async () => {
      setAssetId('');
      setTokenId('');
      setPledgedValue('');
      setHaircutBps('1500');
      setFormError(null);
      await refresh();
    },
    onError: (error) => setFormError(errorMessage(error)),
  });

  const release = useMutation({
    mutationFn: async (id: string) => api.post(`/collateral/${id}/release`),
    onSuccess: async () => {
      setActionError(null);
      await refresh();
    },
    onError: (error) => setActionError(errorMessage(error)),
  });

  const update = useMutation({
    mutationFn: async (id: string) =>
      api.patch(`/collateral/${id}`, {
        haircutBps: editHaircut ? Number(editHaircut) : undefined,
        pledgedValue: editPledged ? Number(editPledged) : undefined,
      }),
    onSuccess: async () => {
      setEditingId(null);
      setActionError(null);
      await refresh();
    },
    onError: (error) => setActionError(errorMessage(error)),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Collateral"
        title="Pledge DNA-backed assets"
        description="Lock asset or tokenized positions as collateral. Advanceable value applies the haircut; active loans reduce available capacity."
      />
      <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">Pledge collateral</h2>
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
                  setPledgedValue('');
                }}
                required
              >
                <option value="">Select asset</option>
                {pledgeableAssets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name}
                    {asset.latestValuation
                      ? ` · mark ${money(asset.latestValuation.payload.amount, asset.latestValuation.payload.currency)}`
                      : ''}
                  </option>
                ))}
              </Select>
            </Field>
            {!pledgeableAssets.length ? (
              <p className="text-sm text-[var(--muted)]">
                All assets with available marks already have an active pledge. Release one to pledge
                again.
              </p>
            ) : null}
            <Field label="Token position (optional)">
              <Select value={tokenId} onChange={(e) => setTokenId(e.target.value)}>
                <option value="">None</option>
                {availableTokens.map((token) => (
                  <option key={token.id} value={token.id}>
                    {token.asset?.name ?? token.id}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Pledged value (optional override)">
              <Input
                type="number"
                min={1}
                step="any"
                value={pledgedValue}
                onChange={(e) => setPledgedValue(e.target.value)}
                placeholder={
                  markAmount != null
                    ? `Default mark ${money(markAmount, markCurrency ?? 'USD')}`
                    : 'Requires valuation mark or manual value'
                }
              />
            </Field>
            <Field label="Haircut (bps)">
              <Input
                type="number"
                min={0}
                max={5000}
                value={haircutBps}
                onChange={(e) => setHaircutBps(e.target.value)}
                required
              />
            </Field>
            {previewPledged > 0 ? (
              <p className="text-sm text-[var(--muted)]">
                Preview advanceable {money(previewAdvanceable, markCurrency ?? 'USD')} after{' '}
                {(previewHaircut / 100).toFixed(1)}% haircut
              </p>
            ) : null}
            {formError ? <p className="text-sm text-red-700">{formError}</p> : null}
            <Button type="submit" disabled={!assetId || create.isPending}>
              {create.isPending ? 'Pledging…' : 'Pledge'}
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
                    pledged {money(item.pledgedValue, item.currency)} · advanceable{' '}
                    {money(item.advanceableValue, item.currency)} · haircut{' '}
                    {(item.haircutBps / 100).toFixed(1)}%
                  </p>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    utilized {money(item.utilizedAmount ?? 0, item.currency)} · available{' '}
                    {money(item.availableAmount ?? item.advanceableValue, item.currency)}
                    {item.token ? ` · token ${item.token.mode}` : ''}
                  </p>
                </div>
                <Badge>{item.status}</Badge>
              </div>

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
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    disabled={!item.canRelease || release.isPending}
                    onClick={() => {
                      setActionError(null);
                      release.mutate(item.id);
                    }}
                  >
                    {item.canRelease ? 'Release' : 'Release blocked'}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setEditingId(editingId === item.id ? null : item.id);
                      setEditHaircut(String(item.haircutBps));
                      setEditPledged(String(item.pledgedValue));
                      setActionError(null);
                    }}
                  >
                    Adjust
                  </Button>
                </div>
              ) : null}
              {!item.canRelease && item.status === 'ACTIVE' ? (
                <p className="mt-2 text-xs text-[var(--muted)]">
                  Repay linked loans before releasing this collateral.
                </p>
              ) : null}

              {editingId === item.id ? (
                <form
                  className="mt-4 grid gap-3 border-t border-[var(--line)] pt-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    update.mutate(item.id);
                  }}
                >
                  <Field label="Pledged value">
                    <Input
                      type="number"
                      min={1}
                      step="any"
                      value={editPledged}
                      onChange={(e) => setEditPledged(e.target.value)}
                    />
                  </Field>
                  <Field label="Haircut (bps)">
                    <Input
                      type="number"
                      min={0}
                      max={5000}
                      value={editHaircut}
                      onChange={(e) => setEditHaircut(e.target.value)}
                    />
                  </Field>
                  <Button type="submit" disabled={update.isPending}>
                    Save terms
                  </Button>
                </form>
              ) : null}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
