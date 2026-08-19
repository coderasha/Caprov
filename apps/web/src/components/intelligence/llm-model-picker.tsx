'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import type { LlmModelSelection } from '@caprov/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

export function LlmModelPicker({ compact = false }: { compact?: boolean }) {
  const queryClient = useQueryClient();
  const [pendingId, setPendingId] = useState<string>();
  const modelsQuery = useQuery({
    queryKey: ['llm-models'],
    queryFn: async () => (await api.get<LlmModelSelection>('/intelligence/models')).data,
  });
  const select = useMutation({
    mutationFn: async (modelId: string) =>
      (await api.patch<LlmModelSelection>('/intelligence/models', { modelId })).data,
    onSuccess: async () => {
      setPendingId(undefined);
      await queryClient.invalidateQueries({ queryKey: ['llm-models'] });
    },
    onError: () => setPendingId(undefined),
  });

  const data = modelsQuery.data;
  if (modelsQuery.isLoading || !data) {
    return (
      <p className="text-sm text-[var(--muted)]">
        {modelsQuery.isError ? 'Could not load LLM models.' : 'Loading models…'}
      </p>
    );
  }

  if (compact) {
    return (
      <div className="grid gap-2">
        <label className="grid gap-2 text-sm">
          <span className="font-medium text-[var(--muted)]">LLM model</span>
          <select
            className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none transition focus:border-[var(--ink)]"
            value={data.selectedModelId}
            disabled={select.isPending}
            onChange={(event) => {
              const modelId = event.target.value;
              setPendingId(modelId);
              select.mutate(modelId);
            }}
          >
            {data.models.map((model) => {
              const available = data.availability[model.id]?.available;
              return (
                <option key={model.id} value={model.id}>
                  {model.label}
                  {available ? '' : ' (key required)'}
                </option>
              );
            })}
          </select>
        </label>
        <p className="text-xs text-[var(--muted)]">
          {data.availability[data.selectedModelId]?.reason}
          {select.isPending && pendingId ? ' Saving…' : null}
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div>
        <h2 className="text-lg font-semibold">LLM model</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Choose the model for copilot synthesis. Asset DNA extraction always uses the CAPROV
          deterministic core for mark accuracy.
        </p>
      </div>
      <div className="grid gap-3">
        {data.models.map((model) => {
          const available = data.availability[model.id]?.available;
          const selected = data.selectedModelId === model.id;
          return (
            <button
              key={model.id}
              type="button"
              disabled={select.isPending}
              onClick={() => {
                if (selected) {
                  return;
                }
                setPendingId(model.id);
                select.mutate(model.id);
              }}
              className={`rounded-2xl border px-4 py-4 text-left transition ${
                selected
                  ? 'border-[var(--ink)] bg-[var(--paper)]'
                  : 'border-[var(--line)] hover:border-[var(--ink)]/40'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{model.label}</p>
                <Badge tone={selected ? 'ink' : 'muted'}>{model.provider}</Badge>
                <Badge tone={available ? 'ok' : 'warn'}>{available ? 'Ready' : 'Key needed'}</Badge>
                {selected ? <Badge tone="accent">Selected</Badge> : null}
              </div>
              <p className="mt-2 text-sm text-[var(--muted)]">{model.description}</p>
              <p className="mt-2 text-xs text-[var(--muted)]">
                {model.strengths.join(' · ')} · {(model.contextWindow / 1000).toFixed(0)}k context
              </p>
              <p className="mt-2 text-xs text-[var(--muted)]">{data.availability[model.id]?.reason}</p>
            </button>
          );
        })}
      </div>
      {select.isPending ? (
        <p className="text-sm text-[var(--muted)]">Saving model preference…</p>
      ) : null}
      {select.isError ? (
        <div className="flex items-center gap-3">
          <p className="text-sm text-[var(--danger)]">Could not save model selection.</p>
          <Button type="button" variant="ghost" onClick={() => modelsQuery.refetch()}>
            Retry
          </Button>
        </div>
      ) : null}
    </div>
  );
}
