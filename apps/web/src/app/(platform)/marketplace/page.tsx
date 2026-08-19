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
import { useState } from 'react';

interface ListingRow {
  id: string;
  title: string;
  status: string;
  askPrice: number;
  currency: string;
  quantityBps: number;
  remainingBps: number;
  asset?: { name: string; assetClass: string } | null;
  valuation?: { payload: { amount: number; currency: string } } | null;
  risk?: { payload: { rating: string } } | null;
}

export default function MarketplacePage() {
  const queryClient = useQueryClient();
  const [assetId, setAssetId] = useState('');
  const [quantityBps, setQuantityBps] = useState('2500');
  const listings = useQuery({
    queryKey: ['marketplace'],
    queryFn: async () => (await api.get<{ listings: ListingRow[] }>('/marketplace')).data.listings,
  });
  const assets = useQuery({
    queryKey: ['assets'],
    queryFn: async () => (await api.get<HydratedAsset[]>('/assets')).data,
  });
  const create = useMutation({
    mutationFn: async () =>
      api.post('/marketplace/listings', {
        assetId,
        quantityBps: Number(quantityBps),
      }),
    onSuccess: async () => {
      setAssetId('');
      await queryClient.invalidateQueries({ queryKey: ['marketplace'] });
    },
  });
  const close = useMutation({
    mutationFn: async (id: string) => api.post(`/marketplace/listings/${id}/close`),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['marketplace'] }),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Marketplace"
        title="Private-asset listings"
        description="Offer economic interest in DNA-backed assets. Ask prices default to the latest valuation mark."
      />
      <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="grid gap-4">
          {(listings.data ?? []).map((listing) => (
            <Card key={listing.id} className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">{listing.title}</h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {listing.asset?.name} · {(listing.remainingBps / 100).toFixed(0)}% remaining
                  </p>
                </div>
                <Badge>{listing.status}</Badge>
              </div>
              <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
                <p className="text-sm font-medium tabular-nums">
                  Ask {money(listing.askPrice, listing.currency)}
                  {listing.risk?.payload.rating ? ` · risk ${listing.risk.payload.rating}` : ''}
                </p>
                {listing.status === 'OPEN' || listing.status === 'PARTIALLY_FILLED' ? (
                  <Button variant="secondary" onClick={() => close.mutate(listing.id)}>
                    Close listing
                  </Button>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">Create listing</h2>
          <form
            className="mt-4 grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate();
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
            <Field label="Quantity (bps, 10000 = 100%)">
              <Input value={quantityBps} onChange={(e) => setQuantityBps(e.target.value)} required />
            </Field>
            <Button type="submit" disabled={create.isPending || !assetId}>
              List interest
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
