# CAPROV Architecture

CAPROV is a modular monolith (`apps/api`) backed by a separate Python intelligence engine (`apps/intelligence-engine`) and a Next.js operator console (`apps/web`).

## Runtime ownership

| Runtime | Owns |
| --- | --- |
| `apps/api` | Auth, organization approvals, users, RBAC, assets, documents, portfolios, intelligence orchestration/jobs, trusted snapshot persistence, capital markets (marketplace → lending), audit, Ethereum Sepolia adapters |
| `apps/intelligence-engine` | Deterministic document classification/extraction, entity/relationship/timeline enrichment, Asset DNA envelope, valuation & risk estimates, engine-side copilot answers |
| `apps/web` | Operator / analyst UI (responsive), registration request flow, platform-admin approval desk, org LLM picker, DNA explorer, capital-markets screens |

Shared contracts live in `packages/types`. The Sepolia token contract lives in `contracts/CaprovAssetToken.sol`.

## Core design rules

1. **Asset DNA** is the central intelligence model — not the legal ownership ledger.
2. Extracted facts retain **source provenance** and **confidence**.
3. **Accuracy-first marks**: Nest deterministic extractor is authoritative; the Python engine may enrich graph/timeline.
4. Organizations select a preferred **LLM for copilot**; DNA extraction stays on the CAPROV deterministic core.
5. **Capital markets** consume DNA valuation marks; they do not invent legal title.
6. **Blockchain** is an adapter for tokenization and provenance anchoring (Ethereum Sepolia) — live when configured, otherwise simulated.
7. **Platform admin approval** gates creation of new organization workspaces from public registration.

## Local demo persistence

The demo API uses a **file-backed store** (`DATA_FILE`, default `data/store.json` at the monorepo root) with in-process mutations and audit events. Prisma / PostgreSQL, Redis, and object storage modules exist as Phase-2 boundaries; they are not required to run the local demo.

Reset demo data by deleting the store file or starting with `RESET_DEMO=true`.

## Module map (`apps/api`)

### Core platform

- `auth`, `organizations`, `users`, `rbac`
- `assets`, `documents`, `portfolios`
- `intelligence` (pipeline orchestration, DNA/valuation/risk/projection snapshots, copilot threads, LLM catalog, provenance anchors)
- `audit`

### Capital markets

- `marketplace` — listings of economic interest in assets
- `orders` — order list alias
- `trading` — place/match buy orders → trades
- `settlement` — settle trades (pending → completed)
- `tokenization` — mint Caprov units on Ethereum Sepolia
- `collateral` — pledge assets/tokens with haircut & utilization
- `lending` — draw/repay facilities against collateral

### Reserved

- `compliance` — `GET /api/compliance/status` stub only

## Web surface

Authenticated shell routes (mobile drawer below `lg`):

Overview · Assets · Documents · Intelligence · Copilot · Portfolios · Marketplace · Trading · Settlement · Tokenization · Collateral · Lending · Organization · Platform Admin · Audit

## External docs

- [AI.md](../AI.md) — pipelines, accuracy, LLM catalog
- [capital-markets.md](../capital-markets.md) — markets APIs & Sepolia setup
- [domain/asset-dna.md](../domain/asset-dna.md) — DNA domain model
