import { execFile } from 'node:child_process';
import type { LlmModelOption } from '@caprov/types';
import { isLlmModelLive } from './llm-catalog';

export interface LlmCopilotResult {
  answer: string;
  mode: 'deterministic' | 'remote';
  modelId: string;
  modelLabel: string;
  live: boolean;
  note?: string;
}

interface ProviderEndpoint {
  url: string;
  model: string;
  apiKeyEnv: string;
  headers?: Record<string, string>;
}

interface ProviderErrorPayload {
  error?: {
    code?: string;
    message?: string;
    type?: string;
  };
}

const CURSOR_AGENT_BINARY =
  process.env.CURSOR_AGENT_BIN?.trim() || 'cursor-agent';
const CURSOR_AGENT_WORKDIR = process.env.CURSOR_AGENT_WORKDIR?.trim() || '/tmp';

const REMOTE_ENDPOINTS: Record<string, ProviderEndpoint> = {
  'openai-gpt-4.1': {
    url: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4.1',
    apiKeyEnv: 'OPENAI_API_KEY',
  },
  'openai-gpt-4o': {
    url: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o',
    apiKeyEnv: 'OPENAI_API_KEY',
  },
  'openai-o3-mini': {
    url: 'https://api.openai.com/v1/chat/completions',
    model: 'o3-mini',
    apiKeyEnv: 'OPENAI_API_KEY',
  },
  'anthropic-claude-sonnet-4': {
    url: 'https://api.anthropic.com/v1/messages',
    model: 'claude-sonnet-4-20250514',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
  },
  'anthropic-claude-haiku-3.5': {
    url: 'https://api.anthropic.com/v1/messages',
    model: 'claude-3-5-haiku-latest',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
  },
  'google-gemini-2.5-pro': {
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent',
    model: 'gemini-2.5-pro',
    apiKeyEnv: 'GOOGLE_API_KEY',
  },
  'google-gemini-2.5-flash': {
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    model: 'gemini-2.5-flash',
    apiKeyEnv: 'GOOGLE_API_KEY',
  },
  'mistral-large': {
    url: 'https://api.mistral.ai/v1/chat/completions',
    model: 'mistral-large-latest',
    apiKeyEnv: 'MISTRAL_API_KEY',
  },
  'meta-llama-4-maverick': {
    url: process.env.OPENAI_COMPAT_BASE_URL
      ? `${process.env.OPENAI_COMPAT_BASE_URL.replace(/\/$/, '')}/chat/completions`
      : 'https://api.groq.com/openai/v1/chat/completions',
    model: process.env.OPENAI_COMPAT_MODEL || 'meta-llama/llama-4-maverick',
    apiKeyEnv: 'OPENAI_COMPAT_API_KEY',
  },
  'xai-grok-3': {
    url: 'https://api.x.ai/v1/chat/completions',
    model: 'grok-3',
    apiKeyEnv: 'XAI_API_KEY',
  },
};

/**
 * Prefer the selected remote model when its API key is present.
 * Falls back to the deterministic local answer otherwise.
 */
export async function resolveCopilotAnswer(options: {
  model: LlmModelOption;
  question: string;
  context: string;
  localAnswer: string;
}): Promise<LlmCopilotResult> {
  const { model, question, context, localAnswer } = options;
  const live = isLlmModelLive(model);

  if (model.alwaysAvailable || model.provider === 'caprov' || !live) {
    return {
      answer: localAnswer,
      mode: 'deterministic',
      modelId: model.id,
      modelLabel: model.label,
      live,
      note: live
        ? undefined
        : model.apiKeyEnv
          ? `Selected ${model.label}; set ${model.apiKeyEnv} for live remote inference. Using CAPROV deterministic core.`
          : undefined,
    };
  }

  if (model.provider === 'cursor') {
    try {
      const remote = await callCursorAgentModel(question, context);
      if (!remote?.trim()) {
        throw new Error('Empty Cursor response');
      }
      return {
        answer: remote.trim(),
        mode: 'remote',
        modelId: model.id,
        modelLabel: model.label,
        live: true,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Cursor call failed';
      return {
        answer: localAnswer,
        mode: 'deterministic',
        modelId: model.id,
        modelLabel: model.label,
        live: true,
        note: `${model.label} live call unavailable (${message}); using CAPROV deterministic core.`,
      };
    }
  }

  const endpoint = REMOTE_ENDPOINTS[model.id];
  if (!endpoint) {
    return {
      answer: localAnswer,
      mode: 'deterministic',
      modelId: model.id,
      modelLabel: model.label,
      live: false,
      note: `${model.label} is selected but no runtime adapter is configured; using deterministic core.`,
    };
  }

  try {
    const remote = await callRemoteModel(endpoint, question, context);
    if (!remote?.trim()) {
      throw new Error('Empty remote response');
    }
    return {
      answer: remote.trim(),
      mode: 'remote',
      modelId: model.id,
      modelLabel: model.label,
      live: true,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Remote call failed';
    return {
      answer: localAnswer,
      mode: 'deterministic',
      modelId: model.id,
      modelLabel: model.label,
      live: true,
      note: `${model.label} live call unavailable (${message}); using CAPROV deterministic core.`,
    };
  }
}

async function buildHttpError(response: Response): Promise<Error> {
  let detail = `HTTP ${response.status}`;

  try {
    const payload = (await response.json()) as ProviderErrorPayload;
    const code = payload.error?.code?.trim();
    const message = payload.error?.message?.trim();
    if (code && message) {
      detail = `HTTP ${response.status}: ${code} - ${message}`;
    } else if (message) {
      detail = `HTTP ${response.status}: ${message}`;
    }
  } catch {
    // Best effort only; keep the HTTP status when the body is empty or non-JSON.
  }

  return new Error(detail);
}

async function callRemoteModel(
  endpoint: ProviderEndpoint,
  question: string,
  context: string,
): Promise<string> {
  const apiKey = process.env[endpoint.apiKeyEnv]?.trim();
  if (!apiKey) {
    throw new Error(`Missing ${endpoint.apiKeyEnv}`);
  }

  const system =
    'You are CAPROV Asset DNA copilot. Answer from the provided context only. Cite facts briefly. If unknown, say so.';

  if (endpoint.url.includes('anthropic.com')) {
    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: endpoint.model,
        max_tokens: 800,
        system,
        messages: [
          {
            role: 'user',
            content: `Context:\n${context}\n\nQuestion: ${question}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      throw await buildHttpError(response);
    }
    const payload = (await response.json()) as {
      content?: Array<{ text?: string }>;
    };
    return payload.content?.map((part) => part.text ?? '').join('\n') ?? '';
  }

  if (endpoint.url.includes('generativelanguage.googleapis.com')) {
    const url = `${endpoint.url}?key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `${system}\n\nContext:\n${context}\n\nQuestion: ${question}`,
              },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      throw await buildHttpError(response);
    }
    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return (
      payload.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? '')
        .join('\n') ?? ''
    );
  }

  const response = await fetch(endpoint.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
      ...endpoint.headers,
    },
    body: JSON.stringify({
      model: endpoint.model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: `Context:\n${context}\n\nQuestion: ${question}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw await buildHttpError(response);
  }
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return payload.choices?.[0]?.message?.content ?? '';
}

async function callCursorAgentModel(
  question: string,
  context: string,
): Promise<string> {
  const apiKey = process.env.CURSOR_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('Missing CURSOR_API_KEY');
  }

  const prompt = [
    'You are CAPROV Asset DNA copilot.',
    'Answer only from the provided context.',
    'Do not run commands.',
    'Do not edit files.',
    'Do not assume facts outside the context.',
    'If the answer is unknown, say so clearly.',
    '',
    `Context:\n${context}`,
    '',
    `Question: ${question}`,
  ].join('\n');

  const stdout = await execCursorAgent(
    ['--print', '--output-format', 'text', prompt],
    apiKey,
  );
  return stdout.trim();
}

async function execCursorAgent(
  args: string[],
  apiKey: string,
): Promise<string> {
  return await new Promise((resolve, reject) => {
    execFile(
      CURSOR_AGENT_BINARY,
      args,
      {
        cwd: CURSOR_AGENT_WORKDIR,
        env: {
          ...process.env,
          CURSOR_API_KEY: apiKey,
        },
        timeout: 60_000,
        maxBuffer: 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr?.trim() || error.message));
          return;
        }
        resolve(stdout);
      },
    );
  });
}
