import { spawnSync } from 'node:child_process';
import type { LlmModelOption } from '@caprov/types';

export const DEFAULT_LLM_MODEL_ID = 'caprov-deterministic';
export const DEFAULT_OPENAI_MODEL_ID = 'openai-gpt-4.1';
const CURSOR_AGENT_BINARY =
  process.env.CURSOR_AGENT_BIN?.trim() || 'cursor-agent';

let cursorAgentAvailable: boolean | undefined;

export const LLM_MODEL_CATALOG: LlmModelOption[] = [
  {
    id: 'caprov-deterministic',
    provider: 'caprov',
    label: 'CAPROV Deterministic Extractor',
    description:
      'Provenance-first labeled-document extractor. Highest accuracy on SPA, title, valuation, LPA and NAV packs without an external LLM.',
    contextWindow: 32_000,
    strengths: ['Exact marks', 'Source citations', 'Offline'],
    capabilities: ['extraction', 'asset_dna', 'valuation', 'risk', 'copilot'],
    alwaysAvailable: true,
  },
  {
    id: 'cursor-agent',
    provider: 'cursor',
    label: 'Cursor Agent',
    description:
      'Cursor Agent synthesis via the official cursor-agent CLI using your Cursor API key.',
    contextWindow: 200_000,
    strengths: ['Code-aware reasoning', 'Long context', 'Copilot'],
    capabilities: ['copilot'],
    alwaysAvailable: false,
    apiKeyEnv: 'CURSOR_API_KEY',
  },
  {
    id: 'openai-gpt-4.1',
    provider: 'openai',
    label: 'OpenAI GPT-4.1',
    description:
      'Strong general reasoning for free-form legal narrative and copilot synthesis.',
    contextWindow: 1_000_000,
    strengths: ['Reasoning', 'Long context', 'Copilot'],
    capabilities: ['extraction', 'asset_dna', 'copilot'],
    alwaysAvailable: false,
    apiKeyEnv: 'OPENAI_API_KEY',
  },
  {
    id: 'openai-gpt-4o',
    provider: 'openai',
    label: 'OpenAI GPT-4o',
    description:
      'Fast multimodal-capable model suited to mixed document and Q&A workloads.',
    contextWindow: 128_000,
    strengths: ['Speed', 'Copilot', 'General docs'],
    capabilities: ['extraction', 'copilot'],
    alwaysAvailable: false,
    apiKeyEnv: 'OPENAI_API_KEY',
  },
  {
    id: 'openai-o3-mini',
    provider: 'openai',
    label: 'OpenAI o3-mini',
    description:
      'Compact reasoning model for structured extraction and risk rationale drafting.',
    contextWindow: 200_000,
    strengths: ['Reasoning', 'Cost'],
    capabilities: ['extraction', 'risk', 'copilot'],
    alwaysAvailable: false,
    apiKeyEnv: 'OPENAI_API_KEY',
  },
  {
    id: 'anthropic-claude-sonnet-4',
    provider: 'anthropic',
    label: 'Anthropic Claude Sonnet 4',
    description:
      'Excellent long-document analysis for complex private-asset packs and audit narratives.',
    contextWindow: 200_000,
    strengths: ['Long docs', 'Careful analysis', 'Copilot'],
    capabilities: ['extraction', 'asset_dna', 'copilot'],
    alwaysAvailable: false,
    apiKeyEnv: 'ANTHROPIC_API_KEY',
  },
  {
    id: 'anthropic-claude-haiku-3.5',
    provider: 'anthropic',
    label: 'Anthropic Claude Haiku 3.5',
    description:
      'Low-latency model for interactive copilot and lightweight extraction assists.',
    contextWindow: 200_000,
    strengths: ['Latency', 'Cost', 'Copilot'],
    capabilities: ['copilot', 'extraction'],
    alwaysAvailable: false,
    apiKeyEnv: 'ANTHROPIC_API_KEY',
  },
  {
    id: 'google-gemini-2.5-pro',
    provider: 'google',
    label: 'Google Gemini 2.5 Pro',
    description: 'Large-context model for multi-document Asset DNA synthesis.',
    contextWindow: 1_000_000,
    strengths: ['Long context', 'Synthesis'],
    capabilities: ['asset_dna', 'copilot', 'extraction'],
    alwaysAvailable: false,
    apiKeyEnv: 'GOOGLE_API_KEY',
  },
  {
    id: 'google-gemini-2.5-flash',
    provider: 'google',
    label: 'Google Gemini 2.5 Flash',
    description: 'Fast Gemini variant for interactive analyst workflows.',
    contextWindow: 1_000_000,
    strengths: ['Speed', 'Cost'],
    capabilities: ['copilot', 'extraction'],
    alwaysAvailable: false,
    apiKeyEnv: 'GOOGLE_API_KEY',
  },
  {
    id: 'mistral-large',
    provider: 'mistral',
    label: 'Mistral Large',
    description:
      'European-hosted capable model for extraction and analyst Q&A.',
    contextWindow: 128_000,
    strengths: ['EU option', 'General reasoning'],
    capabilities: ['extraction', 'copilot'],
    alwaysAvailable: false,
    apiKeyEnv: 'MISTRAL_API_KEY',
  },
  {
    id: 'meta-llama-4-maverick',
    provider: 'meta',
    label: 'Meta Llama 4 Maverick',
    description:
      'Open-weight class model for self-hosted or gateway deployments.',
    contextWindow: 128_000,
    strengths: ['Self-host', 'Open weights'],
    capabilities: ['extraction', 'copilot'],
    alwaysAvailable: false,
    apiKeyEnv: 'OPENAI_COMPAT_API_KEY',
  },
  {
    id: 'xai-grok-3',
    provider: 'xai',
    label: 'xAI Grok 3',
    description: 'Alternative frontier model for exploratory copilot answers.',
    contextWindow: 131_072,
    strengths: ['Copilot', 'Exploration'],
    capabilities: ['copilot'],
    alwaysAvailable: false,
    apiKeyEnv: 'XAI_API_KEY',
  },
];

function hasCursorAgentBinary(): boolean {
  if (cursorAgentAvailable !== undefined) {
    return cursorAgentAvailable;
  }

  const probe = spawnSync(CURSOR_AGENT_BINARY, ['--version'], {
    stdio: 'ignore',
  });
  cursorAgentAvailable = probe.status === 0;
  return cursorAgentAvailable;
}

export function getLlmModel(modelId?: string | null): LlmModelOption {
  return (
    LLM_MODEL_CATALOG.find((model) => model.id === modelId) ??
    LLM_MODEL_CATALOG.find((model) => model.id === DEFAULT_LLM_MODEL_ID)!
  );
}

export function isLlmModelLive(model: LlmModelOption): boolean {
  if (model.alwaysAvailable) {
    return true;
  }
  if (!model.apiKeyEnv) {
    return false;
  }
  if (model.provider === 'cursor') {
    return (
      Boolean(process.env[model.apiKeyEnv]?.trim()) && hasCursorAgentBinary()
    );
  }
  return Boolean(process.env[model.apiKeyEnv]?.trim());
}

export function getLlmModelAvailability(model: LlmModelOption): {
  available: boolean;
  reason: string;
} {
  if (model.alwaysAvailable) {
    return {
      available: true,
      reason: 'Built-in CAPROV extractor — always ready.',
    };
  }

  if (model.provider === 'cursor') {
    const hasKey = Boolean(
      model.apiKeyEnv && process.env[model.apiKeyEnv]?.trim(),
    );
    const hasBinary = hasCursorAgentBinary();

    if (hasKey && hasBinary) {
      return {
        available: true,
        reason: 'Cursor API key and cursor-agent CLI detected.',
      };
    }

    if (!hasKey && !hasBinary) {
      return {
        available: false,
        reason:
          'Set CURSOR_API_KEY and install cursor-agent to enable live Cursor synthesis. Deterministic core will assist until both are present.',
      };
    }

    if (!hasKey) {
      return {
        available: false,
        reason:
          'Set CURSOR_API_KEY to enable live Cursor synthesis. cursor-agent is already installed.',
      };
    }

    return {
      available: false,
      reason:
        'CURSOR_API_KEY is set, but cursor-agent is not installed or not on PATH. Install the official Cursor CLI to enable live synthesis.',
    };
  }

  const live = isLlmModelLive(model);
  return {
    available: live,
    reason: live
      ? `API key detected (${model.apiKeyEnv}).`
      : `Set ${model.apiKeyEnv} to enable live inference. Selection is saved; deterministic core will assist until the key is present.`,
  };
}

export function getPreferredDefaultLlmModelId(): string {
  const preferredOpenAi = LLM_MODEL_CATALOG.find(
    (model) => model.id === DEFAULT_OPENAI_MODEL_ID,
  );
  if (preferredOpenAi && isLlmModelLive(preferredOpenAi)) {
    return preferredOpenAi.id;
  }
  return DEFAULT_LLM_MODEL_ID;
}
