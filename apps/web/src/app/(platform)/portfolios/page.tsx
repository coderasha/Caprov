'use client';

import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { api } from '@/lib/api';
import { assetClassLabel, money, riskTone } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/stores/auth-store';
import type { PortfolioRow } from '@/lib/types';
import type { CurrencyCode } from '@caprov/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';

export default function PortfoliosPage() {
  const roles = useAuthStore((state) => state.roles);
  const isAnalyst = roles.includes('ANALYST');
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: '', description: '', baseCurrency: 'USD' as CurrencyCode });
  const query = useQuery({
    queryKey: ['portfolios'],
    queryFn: async () => (await api.get<PortfolioRow[]>('/portfolios')).data,
  });
  const create = useMutation({
    mutationFn: async () => api.post('/portfolios', form),
    onSuccess: async () => {
      setForm({ name: '', description: '', baseCurrency: 'USD' });
      await queryClient.invalidateQueries({ queryKey: ['portfolios'] });
    },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Portfolios"
        title={isAnalyst ? 'My portfolio' : 'Allocation sleeves'}
        description={isAnalyst ? 'Your assigned holdings and their latest marks.' : 'Group holdings into sleeves for reporting and oversight.'}
      />
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="grid gap-4">
          {(query.data ?? []).map((portfolio) => {
            const value = portfolio.holdings.reduce(
              (sum, holding) => sum + (holding.valuation?.payload.amount ?? 0),
              0,
            );
            return (
              <Link key={portfolio.id} href={`/portfolios/${portfolio.id}`}>
                <Card className="p-6 transition hover:border-[var(--ink)]/20 hover:bg-white/70">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">{portfolio.name}</h2>
                      <p className="mt-1 text-sm text-[var(--muted)]">{portfolio.description}</p>
                    </div>
                    <p className="text-sm font-medium tabular-nums">{money(value, portfolio.baseCurrency)}</p>
                  </div>
                  <p className="mt-4 text-xs text-[var(--muted)]">{portfolio.holdingCount} holdings</p>
                  {isAnalyst && portfolio.holdings.length ? (
                    <div className="mt-4 grid gap-2 border-t border-[var(--line)] pt-4">
                      {portfolio.holdings.map((holding) => (
                        <div key={holding.id} className="flex items-center justify-between gap-3 text-sm">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{holding.asset?.name ?? holding.assetId}</p>
                            <p className="truncate text-xs text-[var(--muted)]">
                              {holding.asset ? `${assetClassLabel[holding.asset.assetClass]}${holding.asset.location ? ` · ${holding.asset.location}` : ''}` : 'Investment holding'}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-3">
                            <span className="tabular-nums">{holding.weight ?? 0}%</span>
                            <Badge tone={riskTone(holding.risk?.payload.rating)}>{holding.risk?.payload.rating ?? 'n/a'}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </Card>
              </Link>
            );
          })}
        </div>
        {!isAnalyst ? <Card className="p-6">
          <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">Create portfolio</h2>
          <form
            className="mt-4 grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate();
            }}
          >
            <Field label="Name">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
            <Field label="Base currency">
              <Select
                value={form.baseCurrency}
                onChange={(e) => setForm({ ...form, baseCurrency: e.target.value as CurrencyCode })}
              >
                {['USD', 'EUR', 'GBP', 'SGD', 'INR'].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </Select>
            </Field>
            <Field label="Description">
              <Textarea
                rows={4}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Field>
            <Button type="submit" disabled={create.isPending}>
              Save portfolio
            </Button>
          </form>
        </Card> : null}
      </div>
    </div>
  );
}
