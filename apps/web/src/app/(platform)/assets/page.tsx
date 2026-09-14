'use client';

import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { assetClassLabel, assetStatusLabel, money, riskTone } from '@/lib/format';
import { useAuthStore } from '@/stores/auth-store';
import type { HydratedAsset } from '@/lib/types';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo, useState } from 'react';

export default function AssetsPage() {
  const roles = useAuthStore((state) => state.roles);
  const canCreateAssets = roles.includes('ORG_ADMIN') || roles.includes('PLATFORM_ADMIN');
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
  const allAssets = assetsQuery.data ?? [];
  const dnaReady = allAssets.filter((asset) => asset.latestDna).length;
  const needsDocuments = allAssets.filter((asset) => asset.documentCount === 0).length;
  const underReview = allAssets.filter((asset) => asset.status === 'UNDER_REVIEW').length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Assets"
        title="Assets"
        description="Create and review the assets your team manages. Each asset becomes the home for documents, Asset DNA, collateral, and lending."
        actions={
          <>
            {canCreateAssets ? (
              <Link href="/assets/new">
                <Button>New asset</Button>
              </Link>
            ) : null}
            <Link href="/documents">
              <Button variant="secondary">Add documents</Button>
            </Link>
          </>
        }
      />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Assets', value: String(allAssets.length), hint: 'Total records in workspace' },
          { label: 'DNA ready', value: String(dnaReady), hint: 'Assets with at least one snapshot' },
          { label: 'Need documents', value: String(needsDocuments), hint: 'Assets not linked to source files yet' },
          { label: 'Under review', value: String(underReview), hint: 'Assets waiting on operator confirmation' },
        ].map((stat) => (
          <Card key={stat.label} className="p-5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">{stat.label}</p>
            <p className="mt-4 font-display text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
              {stat.value}
            </p>
            <p className="mt-2 text-xs text-[var(--muted)]">{stat.hint}</p>
          </Card>
        ))}
      </section>
      <Input
        placeholder="Search by name, location, or asset class"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="w-full max-w-md"
      />
      {allAssets.length === 0 ? (
        <Card className="p-8">
          <h2 className="font-display text-xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
            {canCreateAssets ? 'Start with the first asset record' : 'No assets are available yet'}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            {canCreateAssets
              ? 'Assets are the anchor for the rest of the platform. Once you create one, your team can add documents, review Asset DNA, and move into portfolio, tokenization, collateral, and lending workflows.'
              : 'Assets created by your workspace will appear here. You can review them and ask AI for analysis.'}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            {canCreateAssets ? (
              <Link href="/assets/new">
                <Button>Create asset</Button>
              </Link>
            ) : null}
            <Link href="/documents">
              <Button variant="secondary">See document workflow</Button>
            </Link>
          </div>
        </Card>
      ) : (
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
            {assets.length ? (
              assets.map((asset) => (
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
              ))
            ) : (
              <tr className="border-t border-[var(--line)]/80">
                <td colSpan={6} className="px-6 py-8 text-sm text-[var(--muted)]">
                  No assets match this search. Try another term or clear the filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </Card>
      )}
    </div>
  );
}
