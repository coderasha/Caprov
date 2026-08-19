# Capital markets

CAPROV capital-markets modules sit on top of Asset DNA valuation marks. Listings, trades, collateral, and loans reference `assetId` (and optionally token positions). They are **demo-grade workflows** on the file-backed store — not a regulated exchange or custody system.

## Domain flow

```text
Asset + DNA mark
    → Marketplace listing (quantity in bps)
    → Trading order (BUY) → matched trade
    → Settlement (PENDING → COMPLETED)
    → Tokenization on Ethereum Sepolia (optional)
    → Collateral pledge (haircut → advanceable)
    → Lending facility (principal ≤ available)
```

## API surface (authenticated)

Base: `http://localhost:3001/api`

### Marketplace

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/marketplace` | Overview + listings |
| `GET` | `/marketplace/listings` | Org listings (hydrated with asset/valuation/risk) |
| `POST` | `/marketplace/listings` | Create listing (`assetId`, optional `askPrice`, `quantityBps`) |
| `POST` | `/marketplace/listings/:id/close` | Close listing |

Ask price defaults to the latest DNA valuation mark.

### Trading / orders

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/trading` | Orders + trades |
| `POST` | `/trading/orders` | Place order; `autoMatch: true` (default for BUY) creates a trade |
| `POST` | `/trading/orders/:id/match` | Explicit match |
| `GET` | `/orders` | Order list alias |

Quantities are **basis points** of economic interest (`10000` = 100%).

### Settlement

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/settlement` | Settlements + trade/asset hydrate |
| `POST` | `/settlement` | Open settlement for a trade (`OFF_CHAIN` or `TOKENIZED_TRANSFER`) |
| `POST` | `/settlement/:id/complete` | Mark completed (updates trade to `SETTLED`) |

Roles for create/complete: `ORG_ADMIN`, `ANALYST`, `COMPLIANCE` (create), `PLATFORM_ADMIN` as applicable — analysts may complete settlements in the demo.

### Tokenization (Ethereum Sepolia)

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/tokenization` | Network status + token positions |
| `GET` | `/tokenization/network` | Sepolia status + optional RPC probe |
| `POST` | `/tokenization/tokens` | Mint supply for an asset |

- Chain id: **11155111** (Ethereum Sepolia)
- Default mode: **SIMULATED** (deterministic tx hash + explorer URL)
- Live mode when `ETHEREUM_SEPOLIA_PRIVATE_KEY` and `ETHEREUM_TOKEN_CONTRACT` are set
- Contract source: `contracts/CaprovAssetToken.sol`
- Deploy helper: `scripts/deploy-caprov-token.mjs`

Env (see `apps/api/.env.example`):

```bash
ETHEREUM_SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
ETHEREUM_SEPOLIA_PRIVATE_KEY=
ETHEREUM_TOKEN_CONTRACT=
```

### Collateral

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/collateral` | Positions with utilization, available capacity, linked loans |
| `GET` | `/collateral/:id` | Detail |
| `POST` | `/collateral` | Pledge asset (optional `tokenId`, `haircutBps`, `pledgedValue`) |
| `PATCH` | `/collateral/:id` | Adjust pledged value / haircut (cannot drop below outstanding loans) |
| `POST` | `/collateral/:id/release` | Release when no active loans |

Rules:

- One **ACTIVE** pledge per asset
- Token cannot be pledged twice while active
- `advanceableValue = pledgedValue × (1 − haircutBps/10000)`
- `availableAmount = advanceable − sum(active loan outstanding)`
- Release blocked while active loans remain

### Lending

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/lending` | Facilities hydrated with collateral/asset |
| `POST` | `/lending` | Open loan (`collateralId`, `principal` ≤ advanceable) |
| `POST` | `/lending/:id/repay` | Mark repaid (`outstanding = 0`) |

LTV is recorded in basis points vs pledged value.

## RBAC (demo)

| Action | Typical roles |
| --- | --- |
| Read markets | Any authenticated org member |
| Create listings / orders / tokens / collateral / loans | `ORG_ADMIN`, `ANALYST`, `PLATFORM_ADMIN` |
| Complete settlement | `ORG_ADMIN`, `ANALYST`, `COMPLIANCE`, `PLATFORM_ADMIN` |

Compliance users can read markets but cannot create listings.

## UI

Sidebar (and mobile drawer): **Marketplace**, **Trading**, **Settlement**, **Tokenization**, **Collateral**, **Lending**.

## Seed data

Demo seed includes:

- Harbourview listing (partially filled) + settled trade
- Cedar Ridge simulated Sepolia token → active collateral → active loan

## Testing

```bash
node scripts/smoke-platform.mjs
node scripts/test-capital-markets-e2e.mjs
```
