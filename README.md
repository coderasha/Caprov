# CAPROV

AI-first **private-asset intelligence** platform built around **Asset DNA**, with capital-markets workflows on top of DNA-backed marks.

| Package | Role |
| --- | --- |
| `apps/web` | Operator / analyst console (Next.js) — responsive desktop + mobile drawer |
| `apps/api` | Authoritative business platform (NestJS) — auth, assets, DNA orchestration, capital markets |
| `apps/intelligence-engine` | Deterministic AI runtime (FastAPI) — extraction, DNA, valuation, risk, copilot |
| `packages/types` | Shared TypeScript domain types |
| `contracts/CaprovAssetToken.sol` | Ethereum Sepolia ERC-1155-style asset token |

## What works today

**Intelligence**

- PDF / DOCX / office document upload → classify → extract facts with provenance
- Extracted details rendered in tabular review views for documents and Asset DNA
- Versioned Asset DNA, valuation marks, risk, forward projections (1y / 3y / 5y)
- Trusted internal intelligence layer with content-hashed DNA snapshots
- Ethereum Sepolia-backed provenance anchors for source documents and DNA snapshots
- Org-selectable LLMs for copilot; DNA extraction stays deterministic
- Structured copilot briefings with citations

**Capital markets** (DNA-linked, file-backed demo store)

- Marketplace listings
- Trading / orders with auto-match
- Settlement lifecycle
- Tokenization on **Ethereum Sepolia** (simulated by default; live with env keys)
- Collateral (haircut, utilization, release rules)
- Lending against advanceable collateral

**Platform**

- Platform-admin approval flow for new organization access requests
- Platform admin can create organizations and approve or reject org-admin requests
- Org / users / RBAC, portfolios, audit trail
- Responsive operator UI

**Reserved stub:** `compliance` (`GET /api/compliance/status` only).

See [docs/README.md](docs/README.md) for the full documentation index.

## Demo workspace

| User | Email | Password | Role |
| --- | --- | --- | --- |
| Priya Nair | `priya@caprov.io` | `CaprovDemo!23` | Platform admin |
| Elena Voss | `elena@meridian.caprov` | `CaprovDemo!23` | Org admin |
| Arjun Mehta | `arjun@meridian.caprov` | `CaprovDemo!23` | Analyst |
| Sofia Laurent | `sofia@meridian.caprov` | `CaprovDemo!23` | Compliance |

## Run locally

```bash
pnpm install

# Shared types
pnpm --filter @caprov/types build

# API — http://localhost:3001/api  (Swagger at /api/docs)
pnpm --filter api build
PORT=3001 node apps/api/dist/main.js

# Intelligence engine — http://localhost:8000/api/health
./scripts/run-intelligence-engine.sh

# Web — http://localhost:3000
pnpm --filter web dev
```

The Nest API calls the Python engine for Asset DNA. If the engine is down, it falls back to the same deterministic extractor locally.

Demo data is seeded to `data/store.json` by default (or `DATA_FILE` if overridden). Delete that file or set `RESET_DEMO=true` to reseed.

Open [http://localhost:3000](http://localhost:3000), sign in, then use Overview, Assets, Documents, Intelligence, Copilot, Portfolios, Marketplace, Trading, Settlement, Tokenization, Collateral, Lending, Organization, Platform Admin, and Audit.

### Approval-gated onboarding

- `POST /api/auth/register` creates a pending organization access request instead of an immediate tenant.
- A `PLATFORM_ADMIN` must approve the request before the requester can sign in as the new org admin.
- Platform admins can also create organizations directly from the Platform Admin screen.

### Document intake and extraction

- Upload documents from **Documents** or from an asset detail page.
- Supported test flow includes PDF and DOCX extraction into normalized fact rows.
- Asset document uploads can trigger a fresh Asset DNA rebuild automatically.
- A sample valuation pack is available at `samples/valuation-test-pack.pdf`.

### Accuracy (deterministic core)

- Market value / NAV preferred over purchase price
- Insurance / replacement / book figures rejected as market marks
- Facts keep source document + fragment provenance
- Nest and Python extractors stay in parity; local marks are authoritative

### LLM model selection

Pick a preferred model under **Organization**, **Intelligence**, or **Copilot**. Remote models apply to copilot when the matching API key is set in `apps/api/.env`. See [docs/AI.md](docs/AI.md).

### Ethereum Sepolia tokenization

Defaults to **simulated** Sepolia mints (chain id `11155111`). For live testnet mints:

1. Fund a Sepolia wallet
2. Deploy `contracts/CaprovAssetToken.sol` (`ETHEREUM_SEPOLIA_PRIVATE_KEY=… node scripts/deploy-caprov-token.mjs` after installing `solc`)
3. Set `ETHEREUM_SEPOLIA_PRIVATE_KEY` and `ETHEREUM_TOKEN_CONTRACT` in `apps/api/.env`

See [docs/capital-markets.md](docs/capital-markets.md).

### Atomic asset-token marketplace (Sepolia)

`contracts/CaprovAssetToken.sol` now assigns one immutable ERC-1155 token type and supply to each asset. `contracts/CaprovPaymentToken.sol` is the CAPROV ERC-20 test payment token, and `contracts/CaprovMarketplace.sol` escrows listed asset units and atomically swaps them for CAPROV.

Deploy the three contracts from a funded Sepolia owner wallet:

```bash
node scripts/deploy-caprov-marketplace.mjs
```

Set the three addresses printed by the script in `apps/api/.env`. Sellers must approve the marketplace to transfer their ERC-1155 units before listing; buyers must approve it to spend CAPROV before calling `buy(listingId, units)` from their own wallet. The server must never hold a buyer's private key.

### Trusted intelligence and provenance

- Each DNA rebuild persists a new versioned snapshot instead of overwriting the prior result.
- Snapshots are canonicalized and hashed with `sha256`.
- Source documents and snapshot hashes are anchored through Ethereum Sepolia adapters.
- Without live chain credentials, anchors are simulated but still stored with transaction metadata for end-to-end workflow testing.

## Testing

```bash
# Unit / accuracy
pnpm --filter api test
cd apps/intelligence-engine && . .venv/bin/activate && pytest -q

# Live suites (services must be running)
node scripts/smoke-platform.mjs
node scripts/test-re-valuation-accuracy.mjs
node scripts/test-capital-markets-e2e.mjs
```

## Documentation

| Doc | Contents |
| --- | --- |
| [docs/README.md](docs/README.md) | Doc index |
| [docs/architecture/README.md](docs/architecture/README.md) | Runtime ownership & modules |
| [docs/AI.md](docs/AI.md) | Intelligence engine & LLM catalog |
| [docs/domain/asset-dna.md](docs/domain/asset-dna.md) | Asset DNA domain model |
| [docs/capital-markets.md](docs/capital-markets.md) | Marketplace → lending |
