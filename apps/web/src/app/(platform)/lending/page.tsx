'use client';

import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useMemo, useState } from 'react';

interface CollateralRow {
  id: string;
  status: string;
  advanceableValue: number;
  availableAmount?: number;
  currency: string;
  asset?: { name: string } | null;
}

interface LoanRow {
  id: string;
  status: string;
  principal: number;
  outstanding: number;
  currency: string;
  interestRateBps: number;
  termDays: number;
  ltvBps: number;
  asset?: { name: string } | null;
  collateral?: CollateralRow | null;
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

export default function LendingPage() {
  const queryClient = useQueryClient();
  const [collateralId, setCollateralId] = useState('');
  const [principal, setPrincipal] = useState('10000000');
  const [formError, setFormError] = useState<string | null>(null);
  const loans = useQuery({
    queryKey: ['lending'],
    queryFn: async () => (await api.get<LoanRow[]>('/lending')).data,
  });
  const collateral = useQuery({
    queryKey: ['collateral'],
    queryFn: async () => (await api.get<CollateralRow[]>('/collateral')).data,
  });
  const activeCollateral = useMemo(
    () => (collateral.data ?? []).filter((item) => item.status === 'ACTIVE'),
    [collateral.data],
  );
  const selected = activeCollateral.find((item) => item.id === collateralId);
  const create = useMutation({
    mutationFn: async () =>
      api.post('/lending', {
        collateralId,
        principal: Number(principal),
      }),
    onSuccess: async () => {
      setCollateralId('');
      setFormError(null);
      await queryClient.invalidateQueries({ queryKey: ['lending'] });
      await queryClient.invalidateQueries({ queryKey: ['collateral'] });
    },
    onError: (error) => setFormError(errorMessage(error)),
  });
  const repay = useMutation({
    mutationFn: async (id: string) => api.post(`/lending/${id}/repay`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['lending'] });
      await queryClient.invalidateQueries({ queryKey: ['collateral'] });
    },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Lending"
        title="Collateralized facilities"
        description="Draw loans against advanceable collateral value. LTV is computed from DNA-backed pledged marks."
      />
      <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">Open loan</h2>
          <form
            className="mt-4 grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              setFormError(null);
              create.mutate();
            }}
          >
            <Field label="Collateral">
              <Select value={collateralId} onChange={(e) => setCollateralId(e.target.value)} required>
                <option value="">Select collateral</option>
                {activeCollateral.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.asset?.name ?? item.id} · available{' '}
                    {money(item.availableAmount ?? item.advanceableValue, item.currency)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Principal">
              <Input value={principal} onChange={(e) => setPrincipal(e.target.value)} required />
            </Field>
            {selected ? (
              <p className="text-sm text-[var(--muted)]">
                Available capacity{' '}
                {money(selected.availableAmount ?? selected.advanceableValue, selected.currency)}
              </p>
            ) : null}
            {formError ? <p className="text-sm text-red-700">{formError}</p> : null}
            <Button type="submit" disabled={!collateralId || create.isPending}>
              Draw facility
            </Button>
          </form>
        </Card>
        <div className="grid gap-4">
          {(loans.data ?? []).map((loan) => (
            <Card key={loan.id} className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">
                    {loan.asset?.name ?? loan.id}
                  </h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {money(loan.outstanding, loan.currency)} outstanding · LTV{' '}
                    {(loan.ltvBps / 100).toFixed(1)}% · {(loan.interestRateBps / 100).toFixed(2)}% ·{' '}
                    {loan.termDays}d
                  </p>
                </div>
                <Badge>{loan.status}</Badge>
              </div>
              {loan.status === 'ACTIVE' ? (
                <Button className="mt-4" onClick={() => repay.mutate(loan.id)}>
                  Repay
                </Button>
              ) : null}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
