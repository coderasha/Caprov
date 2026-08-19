'use client';

import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { assetClassLabel, assetStatusLabel, money, riskTone } from '@/lib/format';
import type { HydratedAsset } from '@/lib/types';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo, useState } from 'react';

export default function AssetsPage() {
  const [query, setQuery] = useState('');
  const assetsQuery = useQuery({
    queryKey: ['assets'],
    queryFn: async () => (await api.get<HydratedAsset[]>('/assets')).data,
  });
  const assets = useMemo(() => {
    const list = assetsQuery.data ?? [];
    const q = query.trim().toLowerCase();
    if (!q) {
      return list;
    }
    return list.filter((asset) =>
      [asset.name, asset.location, asset.jurisdiction, assetClassLabel[asset.assetClass]]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [assetsQuery.data, query]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Assets"
        title="Assets"
        description="Create and review the assets your team manages. Each asset becomes the home for documents, Asset DNA, collateral, and lending."
        actions={
          <Link href="/assets/new">
            <Button>New asset</Button>
          </Link>
        }
      />
      <Input
        placeholder="Search by name, location, or asset class"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="w-full max-w-md"
      />
      <Card className="overflow-hidden">
        <div className="caprov-scroll">
        <table className="caprov-table w-full text-left text-sm">
          <thead className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3.5 font-medium sm:px-6">Asset</th>
              <th className="px-3 py-3.5 font-medium">Class</th>
              <th className="px-3 py-3.5 font-medium">Status</th>
              <th className="px-3 py-3.5 font-medium">Value</th>
              <th className="px-3 py-3.5 font-medium">DNA</th>
              <th className="px-4 py-3.5 font-medium sm:px-6">Risk</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((asset) => (
              <tr key={asset.id} className="border-t border-[var(--line)]/80">
                <td className="px-4 py-4 sm:px-6">
                  <Link href={`/assets/${asset.id}`} className="font-medium text-[var(--ink)] hover:underline">
                    {asset.name}
                  </Link>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">{asset.location ?? '—'}</p>
                </td>
                <td className="px-3 py-4 text-[var(--muted)]">{assetClassLabel[asset.assetClass]}</td>
                <td className="px-3 py-4">
                  <Badge tone={asset.status === 'ACTIVE' ? 'ok' : asset.status === 'UNDER_REVIEW' ? 'warn' : 'muted'}>
                    {assetStatusLabel[asset.status]}
                  </Badge>
                </td>
                <td className="px-3 py-4 font-medium tabular-nums">
                  {money(
                    asset.latestValuation?.payload.amount,
                    asset.latestValuation?.payload.currency ?? asset.currency,
                  )}
                </td>
                <td className="px-3 py-4 text-[var(--muted)]">
                  {asset.latestDna ? `v${asset.latestDna.version}` : '—'}
                </td>
                <td className="px-4 py-4 sm:px-6">
                  <Badge tone={riskTone(asset.latestRisk?.payload.rating)}>
                    {asset.latestRisk?.payload.rating ?? 'n/a'}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Card>
    </div>
  );
}
