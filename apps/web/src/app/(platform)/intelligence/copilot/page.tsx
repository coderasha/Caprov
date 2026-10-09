'use client';

import { CopilotBriefingCard, type CopilotBriefing } from '@/components/intelligence/copilot-briefing';
import { LlmModelPicker } from '@/components/intelligence/llm-model-picker';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import {
  assetClassLabel,
  moneyCompact,
  riskTone,
} from '@/lib/format';
import type { HydratedAsset } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import type { LlmModelSelection } from '@caprov/types';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BarChart3,
  Building2,
  FileSearch,
  FileText,
  Info,
  Paperclip,
  Scale,
  Search,
  Send,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

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

const CAPABILITY_TAGS = [
  {
    label: 'Analyze documents',
    icon: FileText,
    prompt: 'What are the key documents?',
  },
  {
    label: 'Find key risks',
    icon: Scale,
    prompt: 'What is the current value and main risk?',
  },
  {
    label: 'Compare valuations',
    icon: BarChart3,
    prompt: 'What is the current valuation and key risks?',
  },
  {
    label: 'Summarize asset DNA',
    icon: Sparkles,
    prompt: 'Summarize the Asset DNA.',
  },
] as const;

const SUGGESTIONS = [
  { label: 'What is the current value and main risk?', icon: BarChart3 },
  { label: 'Who owns this asset?', icon: Users },
  { label: 'What are the key documents?', icon: FileText },
  { label: 'Summarize the Asset DNA.', icon: Sparkles },
  { label: 'What is the projected future value?', icon: TrendingUp },
] as const;

const QUICK_ACTIONS = [
  {
    label: 'What is the current valuation and key risks?',
    icon: BarChart3,
  },
  {
    label: 'Summarize the key documents for this asset.',
    icon: FileText,
  },
  {
    label: 'Explain the ownership structure.',
    icon: Info,
  },
  {
    label: 'What is the projected future value?',
    icon: TrendingUp,
  },
] as const;

export default function CopilotPage() {
  const searchParams = useSearchParams();
  const requestedAssetId = searchParams.get('asset') ?? '';
  const requestedLock = searchParams.get('locked') === '1';
  const roles = useAuthStore((state) => state.roles);
  const bankerOnly =
    roles.includes('BANKER') &&
    !roles.some((role) => ['ORG_ADMIN', 'ANALYST', 'PLATFORM_ADMIN', 'BUYER'].includes(role));

  const [assetId, setAssetId] = useState('');
  const [message, setMessage] = useState('');
  const [threadId, setThreadId] = useState<string>();
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [searchDocuments, setSearchDocuments] = useState(true);
  const [includeMarket, setIncludeMarket] = useState(true);

  const assetsQuery = useQuery({
    queryKey: ['assets'],
    queryFn: async () => (await api.get<HydratedAsset[]>('/assets')).data,
  });
  const modelsQuery = useQuery({
    queryKey: ['llm-models'],
    queryFn: async () => (await api.get<LlmModelSelection>('/intelligence/models')).data,
  });

  const chat = useMutation({
    mutationFn: async (prompt: string) =>
      (
        await api.post<CopilotResponse>('/intelligence/copilot', {
          assetId,
          message: prompt,
          threadId,
          searchDocuments,
          includeMarketData: includeMarket,
        })
      ).data,
    onSuccess: (data) => {
      setThreadId(data.threadId);
      setMessages(data.messages);
      setMessage('');
    },
  });

  useEffect(() => {
    const assets = assetsQuery.data ?? [];
    if (!assets.length) return;
    const requested = assets.find((asset) => asset.id === requestedAssetId);
    const nextAssetId =
      requested?.id ?? assets.find((asset) => asset.id === assetId)?.id ?? assets[0]?.id ?? '';
    if (nextAssetId !== assetId) {
      setAssetId(nextAssetId);
      setThreadId(undefined);
      setMessages([]);
    }
  }, [assetId, assetsQuery.data, requestedAssetId]);

  const selectedAsset = (assetsQuery.data ?? []).find((asset) => asset.id === assetId);
  const activeModelLabel = modelsQuery.data?.selected?.label;
  const lockedToCollateralAsset =
    bankerOnly && requestedLock && Boolean(selectedAsset && selectedAsset.id === requestedAssetId);

  function presentationBriefing(briefing: CopilotBriefing): CopilotBriefing {
    const isSynthesis = /^model synthesis$/i.test(briefing.title);
    return {
      ...briefing,
      title: isSynthesis ? 'Briefing' : briefing.title,
      sections: briefing.sections.filter((section) => !/^service note$/i.test(section.title)),
      disclaimer: isSynthesis ? undefined : briefing.disclaimer,
    };
  }

  function ask(prompt: string) {
    const next = prompt.trim();
    if (!next || !assetId || chat.isPending) return;
    setMessage(next);
    chat.mutate(next);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    ask(message);
  }

  const heroDescription = lockedToCollateralAsset
    ? `Ask credit questions about ${selectedAsset?.name}. This conversation is locked to the collateral asset under review.`
    : bankerOnly
      ? 'Ask credit questions about collateral-backed assets. Answers are grounded in the selected asset’s current DNA and source evidence.'
      : "Ask focused questions and get source-aware insights grounded in your asset's current DNA, documents and market data.";

  return (
    <div className="copilot-mgmt copilot-mgmt--fit mx-auto w-full max-w-[92rem]">
      <header className="copilot-mgmt__hero">
        <div className="copilot-mgmt__hero-copy">
          <p className="copilot-mgmt__eyebrow">Copilot</p>
          <h1 className="copilot-mgmt__title">
            Asset intelligence, <span>powered by AI</span>
          </h1>
          <p className="copilot-mgmt__lede">{heroDescription}</p>
        </div>
        <div className="copilot-mgmt__tags">
          {CAPABILITY_TAGS.map((tag) => (
            <button
              key={tag.label}
              type="button"
              className="copilot-mgmt__tag"
              onClick={() => ask(tag.prompt)}
              disabled={!assetId || chat.isPending}
            >
              <tag.icon size={14} />
              {tag.label}
            </button>
          ))}
        </div>
      </header>

      <div className="copilot-mgmt__layout">
        <aside className="copilot-mgmt__panel copilot-mgmt__config">
          <div className="copilot-mgmt__config-block">
            <p className="copilot-mgmt__section-label">Configure Copilot</p>
            <LlmModelPicker compact />
            <p className="copilot-mgmt__hint">Secure enterprise model for financial analysis.</p>
          </div>

          <div className="copilot-mgmt__config-block">
            {lockedToCollateralAsset ? (
              <div className="copilot-mgmt__locked">
                <p className="copilot-mgmt__field-label">Locked collateral context</p>
                <p className="copilot-mgmt__locked-name">{selectedAsset?.name}</p>
              </div>
            ) : (
              <label className="copilot-mgmt__field">
                <span className="copilot-mgmt__field-label">
                  {bankerOnly ? 'Collateral asset context' : 'Asset context'}
                </span>
                <select
                  className="copilot-mgmt__select"
                  value={assetId}
                  onChange={(event) => {
                    setAssetId(event.target.value);
                    setThreadId(undefined);
                    setMessages([]);
                  }}
                >
                  {(assetsQuery.data ?? []).map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {selectedAsset ? (
              <article className="copilot-mgmt__asset-card">
                <span className="copilot-mgmt__asset-thumb">
                  {selectedAsset.primaryImageUrl ? (
                    <Image
                      src={selectedAsset.primaryImageUrl}
                      alt=""
                      fill
                      unoptimized
                      className="object-cover"
                      sizes="56px"
                    />
                  ) : (
                    <Building2 size={18} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="copilot-mgmt__asset-name">{selectedAsset.name}</p>
                  <p className="copilot-mgmt__asset-meta">
                    {assetClassLabel[selectedAsset.assetClass]}
                    {' · '}
                    {selectedAsset.location ?? selectedAsset.jurisdiction ?? 'Private asset'}
                  </p>
                  <div className="copilot-mgmt__asset-badges">
                    <Badge tone={selectedAsset.latestDna ? 'ok' : 'warn'}>
                      {selectedAsset.latestDna ? 'DNA ready' : 'DNA needed'}
                    </Badge>
                    <Badge tone={riskTone(selectedAsset.latestRisk?.payload.rating)}>
                      {selectedAsset.latestRisk?.payload.rating
                        ? `${selectedAsset.latestRisk.payload.rating} risk`
                        : 'No risk'}
                    </Badge>
                  </div>
                  {selectedAsset.latestValuation ? (
                    <p className="copilot-mgmt__asset-value">
                      {moneyCompact(
                        selectedAsset.latestValuation.payload.amount,
                        selectedAsset.latestValuation.payload.currency,
                      )}
                    </p>
                  ) : null}
                </div>
              </article>
            ) : null}
          </div>

          <div className="copilot-mgmt__suggestions">
            <p className="copilot-mgmt__field-label">Suggested questions</p>
            <div className="copilot-mgmt__suggestion-list">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion.label}
                  type="button"
                  className="copilot-mgmt__suggestion"
                  onClick={() => ask(suggestion.label)}
                  disabled={!assetId || chat.isPending}
                >
                  <span className="copilot-mgmt__suggestion-icon">
                    <suggestion.icon size={14} />
                  </span>
                  <span className="copilot-mgmt__suggestion-text">{suggestion.label}</span>
                  <ArrowRight size={14} className="copilot-mgmt__suggestion-arrow" />
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="copilot-mgmt__panel copilot-mgmt__desk">
          <div className="copilot-mgmt__desk-header">
            <div className="min-w-0">
              <div className="copilot-mgmt__desk-title-row">
                <span className="copilot-mgmt__desk-icon">
                  <Sparkles size={15} />
                </span>
                <h2>Source-aware briefing desk</h2>
              </div>
              <p>
                Get precise, evidence-backed answers using your asset&apos;s documents, DNA and
                market context.
              </p>
            </div>
            <span
              className={cn(
                'copilot-mgmt__grounded',
                selectedAsset?.latestDna ? 'is-ready' : 'is-warn',
              )}
            >
              <span />
              {selectedAsset?.latestDna ? 'Grounded in DNA' : 'No DNA context'}
            </span>
          </div>

          <div className="copilot-mgmt__desk-body">
            {messages.length === 0 ? (
              <div className="copilot-mgmt__welcome">
                <span className="copilot-mgmt__welcome-icon">
                  <Sparkles size={22} />
                </span>
                <h3>How can I help you today?</h3>
                <p>
                  Ask anything about this asset — valuation, risks, ownership, documents,
                  compliance, or market insights.
                </p>
                <div className="copilot-mgmt__quick-grid">
                  {QUICK_ACTIONS.map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      className="copilot-mgmt__quick"
                      onClick={() => ask(action.label)}
                      disabled={!assetId || chat.isPending}
                    >
                      <span className="copilot-mgmt__quick-icon">
                        <action.icon size={16} />
                      </span>
                      <span className="copilot-mgmt__quick-text">{action.label}</span>
                      <ArrowRight size={14} className="copilot-mgmt__quick-arrow" />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="copilot-mgmt__thread">
                {messages.map((item) =>
                  item.role === 'user' ? (
                    <div key={item.id} className="copilot-mgmt__bubble-row is-user">
                      <div className="copilot-mgmt__bubble">{item.content}</div>
                    </div>
                  ) : item.briefing ? (
                    <CopilotBriefingCard
                      key={item.id}
                      briefing={presentationBriefing(item.briefing)}
                      citations={item.citations}
                    />
                  ) : (
                    <div key={item.id} className="copilot-mgmt__bubble-row">
                      <div className="copilot-mgmt__bubble is-assistant">
                        <p className="whitespace-pre-wrap">{item.content}</p>
                        {item.citations?.length ? (
                          <p className="copilot-mgmt__cite">
                            Sources: {item.citations.map((citation) => citation.label).join(', ')}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}
          </div>

          {chat.isPending ? (
            <p className="copilot-mgmt__model-note is-analysing" aria-live="polite">
              Analysing with {activeModelLabel ?? 'selected model'}…
            </p>
          ) : null}

          <form className="copilot-mgmt__composer" onSubmit={onSubmit}>
            <textarea
              className="copilot-mgmt__input"
              rows={2}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Ask a question about this asset..."
              required
            />
            <div className="copilot-mgmt__composer-bar">
              <div className="copilot-mgmt__composer-tools">
                <Link
                  href="/documents"
                  className="copilot-mgmt__tool-icon"
                  aria-label="Add evidence in Documents"
                  title="Add evidence in Documents"
                >
                  <Paperclip size={15} />
                </Link>
                <button
                  type="button"
                  className={cn('copilot-mgmt__tool-chip', searchDocuments && 'is-active')}
                  aria-pressed={searchDocuments}
                  onClick={() => setSearchDocuments((value) => !value)}
                  title={
                    searchDocuments
                      ? 'Document search is on for the next answer'
                      : 'Document search is off for the next answer'
                  }
                >
                  <Search size={13} />
                  Search documents
                </button>
                <button
                  type="button"
                  className={cn('copilot-mgmt__tool-chip', includeMarket && 'is-active')}
                  aria-pressed={includeMarket}
                  onClick={() => setIncludeMarket((value) => !value)}
                  title={
                    includeMarket
                      ? 'Market valuation context is included'
                      : 'Market valuation context is excluded'
                  }
                >
                  <FileSearch size={13} />
                  Include market data
                </button>
              </div>
              <button
                type="submit"
                className="copilot-mgmt__send"
                disabled={chat.isPending || !assetId || !message.trim()}
              >
                <Send size={14} />
                {chat.isPending ? 'Preparing…' : 'Send'}
              </button>
            </div>
            <p className="copilot-mgmt__composer-note">
              Answers are grounded in the selected asset&apos;s stored DNA
              {searchDocuments ? ', documents' : ''}
              {includeMarket ? ' and market marks' : ''}
              {' '}and authorized data sources.
            </p>
          </form>
        </section>
      </div>
    </div>
  );
}
