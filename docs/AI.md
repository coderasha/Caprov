# CAPROV AI Intelligence Engine

This document describes the features of the CAPROV intelligence layer: what it does, how it fits into the platform, how pipelines run, and what each capability produces.

## Role in the platform

| Runtime | Ownership |
| --- | --- |
| `apps/intelligence-engine` | AI runtime — document classification, extraction, entity resolution, relationships, Asset DNA, valuation, risk, copilot |
| `apps/api` | Authoritative business system of record — auth, orgs, assets, documents, portfolios, jobs, audit, capital markets; orchestrates intelligence runs; hosts Ethereum Sepolia adapters |
| `apps/web` | Operator / analyst UI for DNA, valuation, risk, copilot, and capital markets |

The intelligence engine **does not** own authentication, legal ownership ledgers, portfolios, marketplace, settlement, tokenization, collateral, or lending. Those stay in `apps/api`.

Asset DNA is the central intelligence model. It is an intelligence envelope, not the legal source of truth for asset existence or ownership. See [domain/asset-dna.md](./domain/asset-dna.md). Capital markets consume DNA marks; see [capital-markets.md](./capital-markets.md).

## Design principles

1. **Provenance first** — every extracted fact links back to a source document id and text fragment.
2. **Confidence-scored** — facts and aggregates carry confidence scores; document type can boost confidence.
3. **Versioned** — each pipeline run produces a new Asset DNA snapshot version on the asset.
4. **Trusted internal intelligence layer** — each saved snapshot is canonicalized, hashed, and persisted as a reviewable internal golden source.
5. **Tamper-resistant provenance option** — source-document hashes and snapshot hashes can be anchored through Ethereum Sepolia adapters.
6. **Deterministic core** — labeled private-asset documents are processed with a deterministic extractor for repeatable, testable accuracy.
7. **Accuracy-first extraction** — NFKC/OCR text normalization, expanded field synonyms, candidate scoring by document type + as-of recency (not confidence alone), consensus boosts when sources agree within 2%, and rejection of insurance declared values, replacement cost, reinstatement value, and book value as market marks. LLM gap-fill is fragment-validated and cannot invent marks from non-valuation packs.
8. **Selectable LLMs** — organizations choose a preferred model for copilot synthesis; Asset DNA extraction stays on the deterministic core, with optional fragment-validated LLM gap-fill when a key is live.
9. **Graceful fallback** — if the Python engine is unreachable, the Nest API runs the same extraction logic locally; if a remote LLM key is missing, copilot falls back to deterministic retrieval.
10. **Value priority** — market value / fair value / NAV is preferred over purchase price when marking an asset.

## Service endpoints

Base URL (local): `http://localhost:8000/api`

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Engine liveness |
| `POST` | `/pipeline/asset-dna` | Build a full Asset DNA envelope from an asset + documents |
| `POST` | `/pipeline/copilot` | Answer an analyst question against an existing DNA envelope |

### `POST /pipeline/asset-dna`

**Request**

```json
{
  "asset": {
    "id": "ast_harbourview",
    "name": "Harbourview Tower",
    "assetClass": "REAL_ESTATE",
    "currency": "GBP",
    "location": "Canary Wharf, London",
    "jurisdiction": "England & Wales"
  },
  "documents": [
    {
      "id": "doc_hv_val",
      "name": "Knightvale Valuation Memo.pdf",
      "type": "VALUATION_MEMO",
      "text": "Market value: GBP 92,800,000\nOccupancy: 94%\n..."
    }
  ]
}
```

**Response** — Asset DNA envelope (facts, entities, relationships, timeline, valuation, risk, confidence, source document ids).

### `POST /pipeline/copilot`

**Request**

```json
{
  "question": "What is the current value?",
  "envelope": { "...Asset DNA envelope..." }
}
```

**Response**

```json
{
  "answer": "GBP 92,800,000 as of 2026-06-30, using independent valuation memo / appraisal extract. Confidence 98%.",
  "citations": [
    { "label": "Market value", "documentId": "doc_hv_val" }
  ]
}
```

## Platform orchestration (API)

Operators trigger intelligence through the Nest API (authenticated):

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/intelligence/models` | List LLM catalog + org selection + availability |
| `PATCH` | `/api/intelligence/models` | Select org LLM (`{ "modelId": "..." }`) |
| `POST` | `/api/intelligence/assets/:assetId/run` | Run pipeline (`FULL_PIPELINE` by default) |
| `GET` | `/api/intelligence/assets/:assetId/dna` | List versioned DNA snapshots |
| `GET` | `/api/intelligence/assets/:assetId/valuation` | Valuation snapshots |
| `GET` | `/api/intelligence/assets/:assetId/projection` | Forward valuation projections (1y / 3y / 5y) |
| `GET` | `/api/intelligence/assets/:assetId/risk` | Risk snapshots |
| `GET` | `/api/intelligence/jobs` | Job history |
| `POST` | `/api/intelligence/copilot` | Ask copilot (persists thread + messages) |
| `GET` | `/api/intelligence/copilot/threads` | List copilot threads |

### LLM model selection

Organizations pick a preferred LLM from the platform catalog. UI pickers live on:

- **Organization** — firm-wide settings
- **Intelligence** — full catalog with availability
- **Copilot** — compact selector for the active session

#### Split of responsibility

| Workload | Engine used |
| --- | --- |
| Asset DNA extraction, valuation marks, risk | Organization-selected DNA model when live; deterministic core if the model is unavailable or produces no source-validated facts |
| Copilot Q&A synthesis | Selected org model when its API key is live; otherwise deterministic retrieval over the DNA envelope |

The Copilot preference is stored as `llmModelId`; the separate primary DNA preference is stored as `dnaLlmModelId` and defaults to `caprov-deterministic`. DNA selections are limited to models with the `asset_dna` capability and are audited as `intelligence.dna_llm_model_selected`. A live selected DNA model extracts the full supported fact set; only values and provenance fragments found in the uploaded documents are accepted. When no facts survive that validation or the model is unavailable, CAPROV falls back to the deterministic extractor.

#### Catalog

| Model id | Provider | Label | API key env | Always available |
| --- | --- | --- | --- | --- |
| `caprov-deterministic` | caprov | CAPROV Deterministic Extractor | — | Yes |
| `openai-gpt-5.6-terra` | openai | OpenAI GPT-5.6 Terra | `OPENAI_API_KEY` | No |
| `openai-gpt-4.1` | openai | OpenAI GPT-4.1 | `OPENAI_API_KEY` | No |
| `openai-gpt-4o` | openai | OpenAI GPT-4o | `OPENAI_API_KEY` | No |
| `openai-o3-mini` | openai | OpenAI o3-mini | `OPENAI_API_KEY` | No |
| `anthropic-claude-sonnet-4` | anthropic | Anthropic Claude Sonnet 4 | `ANTHROPIC_API_KEY` | No |
| `anthropic-claude-haiku-3.5` | anthropic | Anthropic Claude Haiku 3.5 | `ANTHROPIC_API_KEY` | No |
| `google-gemini-2.5-pro` | google | Google Gemini 2.5 Pro | `GOOGLE_API_KEY` | No |
| `google-gemini-2.5-flash` | google | Google Gemini 2.5 Flash | `GOOGLE_API_KEY` | No |
| `mistral-large` | mistral | Mistral Large | `MISTRAL_API_KEY` | No |
| `meta-llama-4-maverick` | meta | Meta Llama 4 Maverick | `OPENAI_COMPAT_API_KEY` | No |
| `xai-grok-3` | xai | xAI Grok 3 | `XAI_API_KEY` | No |

Meta/Llama uses an OpenAI-compatible gateway. Optional overrides: `OPENAI_COMPAT_BASE_URL`, `OPENAI_COMPAT_MODEL`.

#### API examples

```http
GET /api/intelligence/models
Authorization: Bearer <token>
```

```json
{
  "selectedModelId": "caprov-deterministic",
  "selected": { "id": "caprov-deterministic", "label": "CAPROV Deterministic Extractor", "...": "..." },
  "models": [ "...catalog..." ],
  "availability": {
    "caprov-deterministic": { "available": true, "reason": "Built-in CAPROV extractor — always ready." },
    "openai-gpt-4o": { "available": false, "reason": "Set OPENAI_API_KEY to enable live inference. ..." }
  }
}
```

```http
PATCH /api/intelligence/models
Authorization: Bearer <token>
Content-Type: application/json

{ "modelId": "anthropic-claude-sonnet-4" }
```

Roles allowed to change selection: `ORG_ADMIN`, `PLATFORM_ADMIN`, `ANALYST`.

Copilot responses include a `model` object (`id`, `label`, `provider`, `mode` = `deterministic` | `remote`, `live`, optional `note`).

Implementation references: `apps/api/src/modules/intelligence/llm-catalog.ts`, `llm-models.service.ts`, `llm-runtime.ts`.

Job types reserved / used in the platform:

- `DOCUMENT_INTELLIGENCE`
- `EXTRACTION`
- `ENTITY_RESOLUTION`
- `KNOWLEDGE_GRAPH`
- `ASSET_DNA`
- `VALUATION`
- `RISK`
- `PROJECTION`
- `FULL_PIPELINE` (end-to-end: classify → extract → entities → graph → DNA → valuation → risk → forward projection)

### Registration and approval interaction

The intelligence stack sits behind the platform access model:

- Public registration creates a pending organization access request.
- A platform admin approves or rejects the request in the platform-admin workspace.
- Only approved org admins can sign in and upload source documents for extraction.

## Feature catalog

### 1. Document intelligence & classification

Classifies ingested text by name + content into:

| Type | Typical signals |
| --- | --- |
| `TITLE_DEED` | title, land registry, deed, proprietor, notarial |
| `SPA` | share / sale purchase, bill of sale, gallery invoice |
| `VALUATION_MEMO` | valuation, appraisal, market value, DCF, NAV statement cues |
| `INSURANCE` | insurance, insured value, hull, replacement cost, reinstatement |
| `KYC` | KYC, beneficial ownership, AML |
| `LPA` | limited partnership agreement |
| `FINANCIAL_STATEMENT` | financial statement, balance sheet, NAV |
| `OTHER` | fallback |

Document type feeds confidence bonuses for extraction (valuation memos and title deeds score higher for their native fields).

Uploaded PDF and DOCX files are parsed in the API before deterministic extraction. Resulting fact rows are surfaced in document views, asset views, and the Asset DNA explorer so operators can review structured valuation-relevant details without rereading the full source pack.

### 2. Structured extraction

Labeled field extractors for private-asset paperwork:

| Key | Label | Notes |
| --- | --- | --- |
| `market_value` | Market value | Also matches fair value, fair market value, OMV, GAV, appraisal figure |
| `nav` | Latest NAV | Requires `Latest NAV:` / `NAV:` (avoids “NAV STATEMENT” false positives) |
| `purchase_price` | Purchase price | Acquisition / consideration amount |
| `legal_ownership` | Legal ownership | Enriched with proprietor when value is only a % |
| `proprietor` | Proprietor | Supporting ownership identity |
| `location` | Location | Property / estate / location lines |
| `occupancy` | Occupancy | Percent |
| `walt` / `wale` | WALT / WALE | Lease duration |
| `nia` | Net internal area | Area |
| `commitment` | Commitment | Fund commitment |
| `called_capital` | Called capital | Percent |
| `current_yield` | Current yield | Percent |
| `serial_number` | Serial number | Aviation / equipment |
| `hectares` | Estate size | Agriculture |
| `airframe_hours` | Airframe hours | Aviation |
| `cap_rate` | Cap rate | Real estate |
| `passing_rent` | Passing rent | Real estate |

Each fact includes:

- `value`, optional `numericValue` / `currency` / `unit`
- `confidence`
- `provenance[]` with `sourceDocumentId`, `sourceFragment`, `observedAt`

Duplicate keys keep the **highest-scoring** candidate (document-type priority + as-of recency + confidence), not confidence alone.

### 3. Entity resolution

Builds a canonical entity set from:

- The asset itself (`ASSET`)
- Asset location (`LOCATION`) when present
- Organization-like names in document text (Ltd, LLP, LLC, LP, Pte Ltd, SARL, Partners, Holdings, Fund, etc.)

Entities carry `canonicalName`, aliases (extensible), and confidence.

### 4. Knowledge graph / relationships

Projects relationships such as:

- `LEGAL_OWNER_OF` — when ownership language or SPV naming matches
- `RELATED_TO` — other linked organizations

Relationships store endpoints, type, confidence, and optional source document id.

### 5. Timeline assembly

Builds chronological events from document dates (`As of`, `Date`, or embedded calendar dates), categorized as:

- `OWNERSHIP` — SPA / title
- `VALUATION` — valuation memos
- `LEGAL` — insurance, KYC, LPA
- `DOCUMENT` — other

### 6. Asset DNA composition

`run_asset_dna` returns the full intelligence envelope:

- `summary` — short narrative of sources, primary mark, risk flags
- `facts`, `entities`, `relationships`, `timeline`
- `valuation`, `risk`
- `confidence` — `{ overall, coverage, provenance }`
- `sourceDocumentIds`
- `engine` — `caprov-intelligence-engine` when produced by the Python service
- `version` / `generatedAt` (versioning also applied by the API on persist)

### 7. Valuation intelligence

Mark selection order:

1. `market_value`
2. `nav`
3. `purchase_price`
4. Class heuristic only if nothing extractable

Outputs:

- `amount`, `currency`, `method`, `asOf`
- `low` / `high` band (±7%)
- `confidence` from the winning fact
- Notes (e.g. acquisition price when a later market mark exists; insurance/replacement/book figures ignored; consensus across sources)

Methods include independent valuation memo extract, fund NAV extract, or acquisition-price fallback.

### 8. Risk intelligence

Composite score from:

- Document coverage (breadth of document types)
- Ownership clarity
- Jurisdiction presence
- Income durability (occupancy / WALT–WALE when present)

Produces:

- `overall` (0–100), `rating` (`LOW` | `MODERATE` | `ELEVATED` | `HIGH`)
- `flags` (missing title, thin coverage, lease roll, etc.)
- Dimension breakdowns with rationales
- Confidence for the risk snapshot

### 9. Forward valuation (predictive analysis)

After a current DNA mark exists, CAPROV builds a **deterministic forward valuation** (`caprov-forward-mark-v1`):

| Horizon | Output |
| --- | --- |
| 1 / 3 / 5 years | Base, bear, bull marks + confidence band |

Growth rate starts from asset-class defaults and adjusts for occupancy, WALT/WALE, cap rate, realized drift vs purchase price, and risk rating. Confidence decays with horizon.

**Honest limit:** this is a transparent model from current facts — **not** a market quote, appraisal, or guarantee of future price. Use it for planning ranges; treat DNA marks as authoritative for “what is the value today?”

Surfaced on Asset DNA explorer, `GET /api/intelligence/assets/:id/projection`, and copilot questions like “projected future value”.

### 10. Analyst copilot

Question routing over the DNA envelope (with citations):

| Intent | Behavior |
| --- | --- |
| Predict / forecast / future / forward | Returns 3y (or first) forward mark with bear/bull and model disclaimer |
| Value / NAV / mark / price | Returns preferred mark + method + confidence; cites market value / purchase docs |
| Risk / flags / leases | Returns rating, score, flags, top dimension rationale |
| Ownership / title | Returns legal ownership fact with provenance |
| Occupancy | Returns occupancy fact |
| Fallback | Returns DNA summary and prompts for a sharper question |

API copilot also persists threads and message history for the organization and may return a structured **briefing** (title, headline, metric, sections, confidence, disclaimer) for multi-intent questions.

When a remote LLM is selected and its key is present, the API may synthesize the answer via that provider using DNA/document context; on missing key or provider error it returns the deterministic answer and appends a short note.

### 11. Local fallback (API)

`apps/api` embeds a TypeScript mirror of the same deterministic pipeline (`local-pipeline.ts`). If `INTELLIGENCE_ENGINE_URL` health check fails, the API still completes `FULL_PIPELINE` locally and labels the summary as a local fallback.

## Accuracy rules (current deterministic core)

Tuned for labeled private-asset packs (SPA, title, valuation memo, LPA, NAV, insurance, KYC):

- Market value / NAV wins over purchase price.
- Synonyms include open market value / valuation, fair market value, appraised value, appraisal figure, GAV/OMV, fair value, acquisition/consideration price.
- Text is normalized (NFKC, smart quotes, unicode dashes/spaces, soft hyphens) before matching.
- Candidates are **scored** by document type priority and valuation as-of recency (including natural dates and `valuation date` / `effective date` labels); agreeing marks within 2% get a consensus confidence boost.
- Insurance declared / insured / coverage amounts, **replacement cost**, **reinstatement value**, and **book value** are never used as market marks.
- NAV labels require an explicit colon form (`Latest NAV: …` / `NAV: …`).
- Bare ownership percentages are merged with proprietor names when available.
- Amounts parse `USD|EUR|GBP|SGD|INR` and `$|£|€`, including million / `m` / billion suffixes.
- Optional LLM assist may fill *missing* fields only when the proposed fragment appears in source text; it never overrides a strong deterministic mark and will not accept non-market labels or marks from non-valuation packs.
- Pipeline orchestration is accuracy-first: optimized local marks are authoritative; the Python engine may enrich graph/timeline. Nest and Python extractors are kept in parity.
- Golden tests cover Harbourview, dummy RE packs, insurance/replacement rejection, OMV synonyms, fund NAV preference, as-of recency, consensus, and ownership enrichment.
- Live scripts: `scripts/test-re-valuation-accuracy.mjs`, `scripts/smoke-platform.mjs`.

Asset DNA extraction is **not** a general open-domain LLM. Free-form legalese outside labeled patterns may miss fields; select a remote model for copilot narrative help, but treat marks from the deterministic core as authoritative for labeled packs.

## Module map

```
apps/intelligence-engine/
  app/api/                 FastAPI routes & schemas
  app/core/                Settings
  caprov_intelligence/
    pipeline.py            End-to-end deterministic pipeline (authoritative implementation)
  tests/                   Health + accuracy golden tests
```

Package subfolders under `caprov_intelligence/` (document_intelligence, extraction, …) may exist as layout placeholders; runtime logic lives in `pipeline.py`, mirrored by Nest `extraction-accuracy.ts` / `local-pipeline.ts`.

## Running locally

```bash
# Engine
./scripts/run-intelligence-engine.sh
# → http://localhost:8000/api/health

# API (orchestrates engine)
pnpm --filter @caprov/types build
pnpm --filter api build
PORT=3001 INTELLIGENCE_ENGINE_URL=http://127.0.0.1:8000 node apps/api/dist/main.js
```

Environment (`apps/api/.env` / `.env.example`):

| Variable | Default | Meaning |
| --- | --- | --- |
| `INTELLIGENCE_ENGINE_URL` | `http://localhost:8000` | API → engine base URL |
| `OPENAI_API_KEY` | — | Live OpenAI models in the catalog |
| `ANTHROPIC_API_KEY` | — | Live Anthropic models |
| `GOOGLE_API_KEY` | — | Live Gemini models |
| `MISTRAL_API_KEY` | — | Live Mistral Large |
| `XAI_API_KEY` | — | Live Grok |
| `OPENAI_COMPAT_API_KEY` | — | Meta/Llama via OpenAI-compatible gateway |
| `OPENAI_COMPAT_BASE_URL` | Groq OpenAI URL | Gateway base for Meta/Llama |
| `OPENAI_COMPAT_MODEL` | `meta-llama/llama-4-maverick` | Gateway model name override |
| `ETHEREUM_SEPOLIA_PRIVATE_KEY` | — | Live Sepolia mint signer (optional) |
| `ETHEREUM_TOKEN_CONTRACT` | — | Deployed CaprovAssetToken address (optional) |

## Related docs

- [Architecture](./architecture/README.md)
- [Asset DNA domain model](./domain/asset-dna.md)
- [Capital markets](./capital-markets.md)
- Engine package README: `apps/intelligence-engine/README.md`
