'use client';

import { CopilotBriefingCard, type CopilotBriefing } from '@/components/intelligence/copilot-briefing';
import { LlmModelPicker } from '@/components/intelligence/llm-model-picker';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Select, Textarea } from '@/components/ui/input';
import { api } from '@/lib/api';
import type { HydratedAsset } from '@/lib/types';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Array<{ label: string; documentId?: string }>;
  briefing?: CopilotBriefing;
}

interface CopilotResponse {
  threadId: string;
  answer: string;
  citations: Array<{ label: string; documentId?: string }>;
  briefing?: CopilotBriefing;
  messages: CopilotMessage[];
  model?: {
    id: string;
    label: string;
    provider: string;
    mode: string;
    live: boolean;
    note?: string;
  };
}

const SUGGESTIONS = [
  'What is the current value and main risk?',
  'Who owns the asset?',
  'What is the projected future value?',
  'What is the occupancy?',
];

export default function CopilotPage() {
  const [assetId, setAssetId] = useState('ast_harbourview');
  const [message, setMessage] = useState('What is the current value and main risk?');
  const [threadId, setThreadId] = useState<string>();
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [lastModel, setLastModel] = useState<CopilotResponse['model']>();

  const assetsQuery = useQuery({
    queryKey: ['assets'],
    queryFn: async () => (await api.get<HydratedAsset[]>('/assets')).data,
  });
  const chat = useMutation({
    mutationFn: async () =>
      (await api.post<CopilotResponse>('/intelligence/copilot', { assetId, message, threadId })).data,
    onSuccess: (data) => {
      setThreadId(data.threadId);
      setMessages(data.messages);
      setLastModel(data.model);
      setMessage('');
    },
  });

  const selectedAsset = (assetsQuery.data ?? []).find((asset) => asset.id === assetId);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        eyebrow="Copilot"
        title="Ask across Asset DNA"
        description="Structured briefings cite valuation, risk and source documents. This is retrieval over the intelligence envelope, not a legal opinion."
      />

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.3fr]">
        <div className="space-y-6">
          <Card className="p-5">
            <LlmModelPicker compact />
          </Card>
          <Card className="p-5">
            <Field label="Asset context">
              <Select value={assetId} onChange={(e) => setAssetId(e.target.value)}>
                {(assetsQuery.data ?? []).map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name}
                  </option>
                ))}
              </Select>
            </Field>
            {selectedAsset ? (
              <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
                {selectedAsset.location ?? selectedAsset.jurisdiction ?? 'Private asset'} ·{' '}
                {selectedAsset.currency}
              </p>
            ) : null}
            <div className="mt-5 grid gap-2">
              <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">Suggested</p>
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setMessage(suggestion)}
                  className="rounded-xl border border-[var(--line)] bg-white/50 px-3 py-2.5 text-left text-xs leading-5 text-[var(--ink)] transition hover:border-[var(--ink)]/20 hover:bg-white"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </Card>
        </div>

        <Card className="flex min-h-[28rem] flex-col p-4 sm:min-h-[34rem] sm:p-6">
          <div className="flex-1 space-y-5 overflow-y-auto pr-1">
            {messages.length === 0 ? (
              <div className="grid h-full min-h-[12rem] place-items-center rounded-[1.25rem] border border-dashed border-[var(--line)] bg-[var(--paper)]/50 px-4 text-center sm:min-h-[16rem] sm:px-6">
                <div>
                  <p className="font-display text-lg font-semibold tracking-[-0.02em] text-[var(--ink)]">
                    Briefing desk
                  </p>
                  <p className="mt-2 max-w-sm text-sm leading-6 text-[var(--muted)]">
                    Ask about value, ownership, risk, leases, occupancy or forward marks to receive a
                    structured intelligence card.
                  </p>
                </div>
              </div>
            ) : null}

            {messages.map((item) =>
              item.role === 'user' ? (
                <div key={item.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[var(--ink)] px-4 py-3 text-sm leading-6 text-white">
                    {item.content}
                  </div>
                </div>
              ) : item.briefing ? (
                <CopilotBriefingCard key={item.id} briefing={item.briefing} citations={item.citations} />
              ) : (
                <div
                  key={item.id}
                  className="rounded-[1.25rem] border border-[var(--line)] bg-[var(--card)] px-4 py-3 text-sm leading-7"
                >
                  <p className="whitespace-pre-wrap">{item.content}</p>
                  {item.citations?.length ? (
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      Sources: {item.citations.map((citation) => citation.label).join(', ')}
                    </p>
                  ) : null}
                </div>
              ),
            )}
          </div>

          {lastModel ? (
            <p className="mt-4 text-[11px] text-[var(--muted)]">
              Last reply via {lastModel.label} ({lastModel.mode}
              {lastModel.live ? ', live' : ''})
              {lastModel.note ? ` — ${lastModel.note}` : ''}
            </p>
          ) : null}

          <form
            className="mt-4 grid gap-3 border-t border-[var(--line)]/80 pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              chat.mutate();
            }}
          >
            <Textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ask a precise question about this asset…"
              required
            />
            <div className="flex justify-end">
              <Button type="submit" disabled={chat.isPending || !message.trim()}>
                {chat.isPending ? 'Preparing briefing…' : 'Ask copilot'}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
