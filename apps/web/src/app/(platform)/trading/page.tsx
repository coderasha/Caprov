'use client';

import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

interface ListingRow {
  id: string;
  title: string;
  status: string;
  askPrice: number;
  currency: string;
  remainingBps: number;
}

interface OrderRow {
  id: string;
  listingId: string;
  side: string;
  status: string;
  price: number;
  currency: string;
  quantityBps: number;
  filledBps: number;
}

interface TradeRow {
  id: string;
  orderId: string;
  status: string;
  price: number;
  currency: string;
  quantityBps: number;
  notional: number;
}

export default function TradingPage() {
  const queryClient = useQueryClient();
  const [listingId, setListingId] = useState('');
  const [quantityBps, setQuantityBps] = useState('500');
  const trading = useQuery({
    queryKey: ['trading'],
    queryFn: async () =>
      (await api.get<{ orders: OrderRow[]; trades: TradeRow[] }>('/trading')).data,
  });
  const listings = useQuery({
    queryKey: ['marketplace'],
    queryFn: async () => (await api.get<{ listings: ListingRow[] }>('/marketplace')).data.listings,
  });
  const openListings = useMemo(
    () =>
      (listings.data ?? []).filter(
        (item) => item.status === 'OPEN' || item.status === 'PARTIALLY_FILLED',
      ),
    [listings.data],
  );
  const selected = openListings.find((item) => item.id === listingId);
  const place = useMutation({
    mutationFn: async () =>
      api.post('/trading/orders', {
        listingId,
        side: 'BUY',
        price: selected?.askPrice,
        quantityBps: Number(quantityBps),
        autoMatch: true,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['trading'] });
      await queryClient.invalidateQueries({ queryKey: ['marketplace'] });
    },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Trading"
        title="Orders and matches"
        description="Place buy interest against open listings. Matching creates trades awaiting settlement."
      />
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">Place buy order</h2>
          <form
            className="mt-4 grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              place.mutate();
            }}
          >
            <Field label="Listing">
              <Select value={listingId} onChange={(e) => setListingId(e.target.value)} required>
                <option value="">Select listing</option>
                {openListings.map((listing) => (
                  <option key={listing.id} value={listing.id}>
                    {listing.title}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Quantity (bps)">
              <Input value={quantityBps} onChange={(e) => setQuantityBps(e.target.value)} required />
            </Field>
            {selected ? (
              <p className="text-sm text-[var(--muted)]">
                Ask {money(selected.askPrice, selected.currency)} · remaining{' '}
                {(selected.remainingBps / 100).toFixed(0)}%
              </p>
            ) : null}
            <Button type="submit" disabled={!listingId || place.isPending}>
              Match buy order
            </Button>
          </form>
        </Card>
        <div className="grid gap-4">
          <Card className="p-6">
            <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">Orders</h2>
            <div className="mt-4 grid gap-3">
              {(trading.data?.orders ?? []).map((order) => (
                <div key={order.id} className="flex items-center justify-between gap-3 border-b border-[var(--line)] pb-3 last:border-0">
                  <div>
                    <p className="text-sm font-medium">
                      {order.side} {(order.quantityBps / 100).toFixed(0)}% @ {money(order.price, order.currency)}
                    </p>
                    <p className="text-xs text-[var(--muted)]">filled {(order.filledBps / 100).toFixed(0)}%</p>
                  </div>
                  <Badge>{order.status}</Badge>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-6">
            <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">Trades</h2>
            <div className="mt-4 grid gap-3">
              {(trading.data?.trades ?? []).map((trade) => (
                <div key={trade.id} className="flex items-center justify-between gap-3 border-b border-[var(--line)] pb-3 last:border-0">
                  <div>
                    <p className="text-sm font-medium">{money(trade.notional, trade.currency)}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {(trade.quantityBps / 100).toFixed(0)}% · {trade.id}
                    </p>
                  </div>
                  <Badge>{trade.status}</Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
