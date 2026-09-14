'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import { api } from '@/lib/api';
import { assetClassLabel, money, riskTone } from '@/lib/format';
import type { HydratedAsset, PortfolioRow } from '@/lib/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';

export default function PortfolioDetailPage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [assetId, setAssetId] = useState('');
  const [weight, setWeight] = useState(0);
  const portfolioQuery = useQuery({
    queryKey: ['portfolio', params.id],
    queryFn: async () => (await api.get<PortfolioRow>(`/portfolios/${params.id}`)).data,
  });
  const assetsQuery = useQuery({
    queryKey: ['assets'],
    queryFn: async () => (await api.get<HydratedAsset[]>('/assets')).data,
  });
  const addHolding = useMutation({
    mutationFn: async () => api.post(`/portfolios/${params.id}/holdings`, { assetId, weight }),
    onSuccess: async () => {
      setAssetId('');
      setWeight(0);
      await queryClient.invalidateQueries({ queryKey: ['portfolio', params.id] });
      await queryClient.invalidateQueries({ queryKey: ['portfolios'] });
    },
  });
  const removeHolding = useMutation({
    mutationFn: async (holdingId: string) => api.delete(`/portfolios/${params.id}/holdings/${holdingId}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['portfolio', params.id] });
    },
  });

  const portfolio = portfolioQuery.data;
  if (!portfolio) {
    return <p className="text-sm text-[var(--muted)]">Loading portfolio…</p>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">Portfolio</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{portfolio.name}</h1>
        <p className="mt-2 text-[var(--muted)]">{portfolio.description}</p>
      </div>
      <Card className="overflow-hidden">
        <div className="caprov-scroll">
        <table className="caprov-table w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3 font-medium sm:px-6">Asset</th>
              <th className="px-3 py-3 font-medium">Weight</th>
              <th className="px-3 py-3 font-medium">Investment details</th>
              <th className="px-3 py-3 font-medium">Value</th>
              <th className="px-4 py-3 font-medium sm:px-6">Risk</th>
            </tr>
          </thead>
          <tbody>
            {portfolio.holdings.map((holding) => (
              <tr key={holding.id} className="border-t border-[var(--line)]">
                <td className="px-4 py-4 sm:px-6">
                  {holding.asset ? (
                    <Link href={`/assets/${holding.asset.id}`} className="font-medium hover:underline">
                      {holding.asset.name}
                    </Link>
                  ) : (
                    holding.assetId
                  )}
                  <p className="text-xs text-[var(--muted)]">
                    {holding.asset ? `${assetClassLabel[holding.asset.assetClass]}${holding.asset.location ? ` · ${holding.asset.location}` : ''}` : ''}
                  </p>
                  {holding.asset?.description ? <p className="mt-1 max-w-sm text-xs leading-5 text-[var(--muted)]">{holding.asset.description}</p> : null}
                </td>
                <td className="px-3 py-4">{holding.weight ?? '—'}%</td>
                <td className="px-3 py-4 text-xs leading-5 text-[var(--muted)]">
                  <p>{holding.asset?.jurisdiction ?? 'Jurisdiction not recorded'}</p>
                  <p>{holding.asset?.documentCount ?? 0} current documents</p>
                  <p>{holding.asset?.ownerships.length ?? 0} ownership records</p>
                </td>
                <td className="px-3 py-4">
                  {money(holding.valuation?.payload.amount, holding.valuation?.payload.currency)}
                </td>
                <td className="px-4 py-4 sm:px-6">
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge tone={riskTone(holding.risk?.payload.rating)}>
                      {holding.risk?.payload.rating ?? 'n/a'}
                    </Badge>
                    <button
                      type="button"
                      className="text-xs text-[var(--danger)]"
                      onClick={() => removeHolding.mutate(holding.id)}
                    >
                      Remove
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Card>
      <Card className="p-6">
        <h2 className="text-lg font-semibold">Add holding</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          The weight you assign to the new asset will automatically rebalance the existing holdings.
        </p>
        <form
          className="mt-4 grid gap-3 sm:grid-cols-[1fr_120px_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            addHolding.mutate();
          }}
        >
          <Field label="Asset">
            <Select value={assetId} onChange={(e) => setAssetId(e.target.value)} required>
              <option value="">Select asset</option>
              {(assetsQuery.data ?? []).map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Weight %">
            <Input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={weight}
              onChange={(e) => setWeight(Number(e.target.value))}
            />
          </Field>
          <div className="flex items-end">
            <Button type="submit" disabled={addHolding.isPending || !assetId}>
              Add
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
