# CAPROV API (`apps/api`)

NestJS business platform for CAPROV — system of record, intelligence orchestration, and capital markets.

## Run

```bash
# from repo root
pnpm --filter @caprov/types build
pnpm --filter api build
PORT=3001 node apps/api/dist/main.js
# → http://localhost:3001/api
# → Swagger http://localhost:3001/api/docs
```

Dev watch (optional): `pnpm --filter api start:dev`

## Configuration

Copy `.env.example` → `.env`. Important variables:

| Variable | Purpose |
| --- | --- |
| `PORT` | Default `3001` |
| `JWT_SECRET` | Auth signing |
| `WEB_ORIGIN` | CORS (default `http://localhost:3000`) |
| `INTELLIGENCE_ENGINE_URL` | Python engine base (default `http://localhost:8000`) |
| `DATA_FILE` | File store path (default `data/store.json`) |
| `RESET_DEMO` | Reseed store on boot when `true` |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / … | Optional remote LLMs for copilot |
| `ETHEREUM_SEPOLIA_*`, `ETHEREUM_TOKEN_CONTRACT` | Optional live Sepolia minting and provenance anchoring |

## Modules

- **Core:** auth, organizations, users, rbac, assets, documents, portfolios, audit
- **Intelligence:** pipeline runs, DNA / valuation / risk / projection snapshots, copilot, LLM catalog, provenance anchors
- **Capital markets:** marketplace, orders, trading, settlement, tokenization, collateral, lending
- **Infrastructure:** file database, blockchain (`EthereumSepoliaTokenService`), storage/queue/redis/prisma stubs for Phase-2

## Persistence

Local demo uses a JSON file store with org-scoped records and audit events. Seed data includes platform-admin and Meridian demo users, assets, DNA snapshots, and sample markets rows.

Public registration creates a pending organization access request. A platform admin must approve it before the requester can sign in as the new org admin.

## Tests

```bash
pnpm --filter api test
# from repo root, with API running:
node scripts/smoke-platform.mjs
node scripts/test-re-valuation-accuracy.mjs
node scripts/test-capital-markets-e2e.mjs
```

## Docs

- [docs/architecture/README.md](../../docs/architecture/README.md)
- [docs/AI.md](../../docs/AI.md)
- [docs/capital-markets.md](../../docs/capital-markets.md)
