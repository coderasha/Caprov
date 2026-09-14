'use client';

import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Select } from '@/components/ui/input';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { approveSettlement } from '@/lib/sepolia-marketplace';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

interface TradeRow {
  id: string;
  status: string;
  notional: number;
  currency: string;
  quantityBps: number;
  onChainPurchaseId?: string;
  tokenUnits?: number;
}

interface SettlementRow {
  id: string;
  tradeId: string;
  status: string;
  method: string;
  notes?: string;
  trade?: TradeRow | null;
  asset?: { name: string } | null;
}

export default function SettlementPage() {
  const queryClient = useQueryClient();
  const [tradeId, setTradeId] = useState('');
  const settlements = useQuery({
    queryKey: ['settlement'],
    queryFn: async () => (await api.get<SettlementRow[]>('/settlement')).data,
  });
  const trading = useQuery({
    queryKey: ['trading'],
    queryFn: async () => (await api.get<{ trades: TradeRow[] }>('/trading')).data,
  });
  const pendingTrades = useMemo(
    () =>
      (trading.data?.trades ?? []).filter(
        (trade) => trade.status === 'PENDING_SETTLEMENT' || trade.status === 'SETTLING',
      ),
    [trading.data],
  );
  const create = useMutation({
    mutationFn: async () => api.post('/settlement', { tradeId, method: 'TOKENIZED_TRANSFER' }),
    onSuccess: async () => {
      setTradeId('');
      await queryClient.invalidateQueries({ queryKey: ['settlement'] });
      await queryClient.invalidateQueries({ queryKey: ['trading'] });
    },
  });
  const complete = useMutation({
    mutationFn: async (item: SettlementRow) => {
      if (!item.trade?.onChainPurchaseId) throw new Error('This settlement is not linked to a Sepolia CAP escrow purchase.');
      const receipt = await approveSettlement(item.trade.onChainPurchaseId);
      return api.post(`/settlement/${item.id}/complete`, { settlementTxHash: receipt.hash });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['settlement'] });
      await queryClient.invalidateQueries({ queryKey: ['trading'] });
    },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Settlement"
        title="Trade settlement"
        description="Sellers approve a CAP-escrow trade. Sepolia atomically pays CAP and transfers ERC-1155 asset units."
      />
      <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">Open settlement</h2>
          <form
            className="mt-4 grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate();
            }}
          >
            <Field label="Trade">
              <Select value={tradeId} onChange={(e) => setTradeId(e.target.value)} required>
                <option value="">Select trade</option>
                {pendingTrades.map((trade) => (
                  <option key={trade.id} value={trade.id}>
                    {trade.id} · {money(trade.notional, trade.currency)}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" disabled={!tradeId || create.isPending}>
              Create settlement
            </Button>
          </form>
        </Card>
        <div className="grid gap-4">
          {(settlements.data ?? []).map((item) => (
            <Card key={item.id} className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">
                    {item.asset?.name ?? item.tradeId}
                  </h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {item.method}
                    {item.trade ? ` · ${money(item.trade.notional, item.trade.currency)}` : ''}
                  </p>
                </div>
                <Badge>{item.status}</Badge>
              </div>
              {item.status !== 'COMPLETED' ? (
                <Button className="mt-4" onClick={() => complete.mutate(item)} disabled={complete.isPending || !item.trade?.onChainPurchaseId}>
                  Approve settlement on Sepolia
                </Button>
              ) : null}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
