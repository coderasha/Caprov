import type { DnaFact, LlmModelOption } from '@caprov/types';
import { createId } from '../../infrastructure/database/ids';
import { isLlmModelLive } from './llm-catalog';
import {
  isNonMarketValueFragment,
  parseAmount,
  parsePercent,
  parseYears,
} from './extraction-accuracy';
import type { PipelineDocument } from './local-pipeline';

const GAP_KEYS = [
  'market_value',
  'nav',
  'purchase_price',
  'legal_ownership',
  'occupancy',
  'walt',
  'wale',
  'cap_rate',
  'passing_rent',
] as const;

/**
 * Optional LLM gap-fill: only accepts fields whose value string appears in source text
 * and parses cleanly. Never overrides an existing high-confidence deterministic fact.
 */
export async function assistExtractionGaps(options: {
  model: LlmModelOption;
  documents: PipelineDocument[];
  facts: DnaFact[];
}): Promise<{ facts: DnaFact[]; filled: string[]; note?: string }> {
  const { model, documents, facts } = options;
  if (
    !isLlmModelLive(model) ||
    model.provider === 'caprov' ||
    model.alwaysAvailable
  ) {
    return { facts, filled: [] };
  }

  const missing = GAP_KEYS.filter(
    (key) => !facts.some((fact) => fact.key === key && fact.value),
  );
  if (!missing.length) {
    return {
      facts,
      filled: [],
      note: 'Deterministic extractor already complete; LLM assist skipped.',
    };
  }

  const corpus = documents
    .map(
      (document) =>
        `--- ${document.name} (${document.id}) ---\n${(document.extractedText ?? '').slice(0, 4000)}`,
    )
    .join('\n\n')
    .slice(0, 14_000);

  try {
    const raw = await callJsonAssist(model, missing, corpus);
    if (!raw) {
      return { facts, filled: [], note: 'LLM assist returned no usable JSON.' };
    }

    const filled: string[] = [];
    const next = [...facts];
    for (const key of missing) {
      const proposed = raw[key];
      if (!proposed?.value || !proposed.fragment) continue;
      const haystack = documents
        .map((document) => document.extractedText ?? '')
        .join('\n')
        .toLowerCase();
      if (!haystack.includes(proposed.fragment.toLowerCase().slice(0, 40))) {
        continue;
      }
      if (
        !haystack.includes(String(proposed.value).toLowerCase().slice(0, 24))
      ) {
        continue;
      }
      const source = documents.find((document) =>
        (document.extractedText ?? '')
          .toLowerCase()
          .includes(proposed.fragment.toLowerCase().slice(0, 40)),
      );
      if (!source) continue;

      const fragment = proposed.fragment.slice(0, 180);
      if (
        (key === 'market_value' || key === 'nav') &&
        (source.type === 'INSURANCE' ||
          isNonMarketValueFragment(fragment) ||
          isNonMarketValueFragment(proposed.value))
      ) {
        continue;
      }
      if (
        ['market_value', 'nav'].includes(key) &&
        !['VALUATION_MEMO', 'FINANCIAL_STATEMENT'].includes(source.type)
      ) {
        // Gap-fill marks only from valuation / financial packs for accuracy.
        continue;
      }

      const parsed = parseAmount(proposed.value);
      if (parsed && parsed.amount <= 0) continue;
      let confidence = Math.min(
        0.86,
        Number((proposed.confidence ?? 0.8).toFixed(2)),
      );
      if (['market_value', 'nav'].includes(key)) {
        confidence = Math.min(confidence, 0.78);
      }
      next.push({
        id: createId('fact'),
        key,
        label: key
          .replaceAll('_', ' ')
          .replace(/\b\w/g, (char) => char.toUpperCase()),
        value: proposed.value,
        numericValue:
          parsed?.amount ??
          parsePercent(proposed.value) ??
          parseYears(proposed.value),
        currency: parsed?.currency,
        unit:
          parsePercent(proposed.value) != null && !parsed
            ? '%'
            : parseYears(proposed.value) != null
              ? 'years'
              : undefined,
        confidence,
        provenance: [
          {
            sourceDocumentId: source.id,
            sourceFragment: fragment,
            confidence,
            observedAt: new Date().toISOString(),
          },
        ],
      });
      filled.push(key);
    }

    return {
      facts: next,
      filled,
      note: filled.length
        ? `LLM assist filled: ${filled.join(', ')} (fragment-validated).`
        : 'LLM assist found no fragment-validated gaps.',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'assist failed';
    return { facts, filled: [], note: `LLM assist skipped (${message}).` };
  }
}

async function callJsonAssist(
  model: LlmModelOption,
  missing: readonly string[],
  corpus: string,
): Promise<Record<
  string,
  { value: string; fragment: string; confidence?: number }
> | null> {
  const apiKeyEnv = model.apiKeyEnv;
  if (!apiKeyEnv) return null;
  const apiKey = process.env[apiKeyEnv]?.trim();
  if (!apiKey) return null;

  const prompt = `Extract only these missing private-asset fields as JSON object keyed by field name: ${missing.join(', ')}.
Each value must be {"value":"...","fragment":"exact quote from documents","confidence":0-1}.
If unknown, omit the key. Do not invent amounts.
Never use declared value, insured value, sum insured, replacement cost, reinstatement value, or book value as market_value or nav.
Prefer valuation memos and financial statements for marks. Documents:\n${corpus}`;

  if (model.id === 'openai-gpt-5.6-terra') {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-5.6-terra',
        instructions:
          'Return only valid JSON. Never invent numbers not present in the documents.',
        input: prompt,
        max_output_tokens: 800,
        reasoning: { effort: 'medium' },
        text: { verbosity: 'low' },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as {
      output_text?: string;
      output?: Array<{
        content?: Array<{ type?: string; text?: string }>;
      }>;
    };
    const text =
      payload.output_text ??
      payload.output
        ?.flatMap((item) => item.content ?? [])
        .filter((item) => item.type === 'output_text')
        .map((item) => item.text ?? '')
        .join('\n') ??
      '';
    return parseJsonObject(text);
  }

  // Prefer OpenAI-compatible chat completions when possible.
  const endpoint =
    model.provider === 'anthropic'
      ? 'https://api.anthropic.com/v1/messages'
      : model.provider === 'google'
        ? null
        : model.provider === 'mistral'
          ? 'https://api.mistral.ai/v1/chat/completions'
          : model.provider === 'xai'
            ? 'https://api.x.ai/v1/chat/completions'
            : 'https://api.openai.com/v1/chat/completions';

  if (!endpoint) {
    return null;
  }

  if (model.provider === 'anthropic') {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model.id.includes('haiku')
          ? 'claude-3-5-haiku-latest'
          : 'claude-sonnet-4-20250514',
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as {
      content?: Array<{ text?: string }>;
    };
    return parseJsonObject(
      payload.content?.map((part) => part.text ?? '').join('\n') ?? '',
    );
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model:
        model.id === 'openai-gpt-4o'
          ? 'gpt-4o'
          : model.id === 'openai-o3-mini'
            ? 'o3-mini'
            : model.id === 'mistral-large'
              ? 'mistral-large-latest'
              : model.id === 'xai-grok-3'
                ? 'grok-3'
                : 'gpt-4.1',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Return only valid JSON. Never invent numbers not present in the documents.',
        },
        { role: 'user', content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return parseJsonObject(payload.choices?.[0]?.message?.content ?? '');
}

function parseJsonObject(
  text: string,
): Record<
  string,
  { value: string; fragment: string; confidence?: number }
> | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<
      string,
      { value: string; fragment: string; confidence?: number }
    >;
  } catch {
    return null;
  }
}
