# CAPROV Setup Guide

This guide gives step-by-step commands to set up the CAPROV project locally, with clear separation between frontend, backend, AI engine, and blockchain tasks.

The current local demo runs on a file-backed store. PostgreSQL and Redis are optional boundaries for later phases and are not required to boot the updated platform.

## 1. Prerequisites

Install these first:

- Node.js 20+
- pnpm 10+
- Python 3.10+
- Git

Optional for live blockchain deployment:

- A Sepolia-funded Ethereum wallet
- `solc` available through the workspace dependencies

## 2. Clone and Install Workspace Dependencies

```bash
git clone <your-repo-url> Caprov
cd Caprov
pnpm install
```

Build shared types before running the apps:

```bash
pnpm --filter @caprov/types build
```

## 3. Backend Setup

The backend is the NestJS API in `apps/api`.

### 3.1 Create the backend environment file

```bash
cp apps/api/.env.example apps/api/.env
```

### 3.2 Build and run the backend

```bash
pnpm --filter api build
PORT=3001 node apps/api/dist/main.js
```

For development mode with file watching:

```bash
pnpm --filter api start:dev
```

Backend URLs:

- API base: `http://localhost:3001/api`
- Swagger docs: `http://localhost:3001/api/docs`

## 4. Frontend Setup

The frontend is the Next.js app in `apps/web`.

### 4.1 Start the frontend

```bash
pnpm --filter web dev
```

Frontend URL:

- App: `http://localhost:3000`

The frontend expects the backend to be available at `http://localhost:3001`.

### 4.2 Test the approval flow

- Visit `http://localhost:3000/register` to submit a new organization access request.
- Sign in as the platform admin to approve or reject requests:
  - Email: `priya@caprov.io`
  - Password: `CaprovDemo!23`
- After approval, the requester can sign in as the new org admin.

## 5. AI Engine Setup

The AI engine is the Python service in `apps/intelligence-engine`.

### 5.1 Start the AI engine

Use the provided script. It automatically:

- creates `apps/intelligence-engine/.venv` if missing
- upgrades `pip`
- installs the required Python packages
- starts the service with Uvicorn on port `8000`

```bash
./scripts/run-intelligence-engine.sh
```

Alternative:

```bash
pnpm --filter intelligence-engine dev
```

AI engine URL:

- Health/API base: `http://localhost:8000/api/health`

The backend points to this service through:

```env
INTELLIGENCE_ENGINE_URL=http://localhost:8000
```

## 6. Blockchain Setup

Blockchain support is optional unless you want live Ethereum Sepolia token deployment.

### 6.1 Simulated mode

No extra blockchain setup is needed for simulated tokenization or simulated provenance anchoring.

The platform supports simulated Sepolia minting and simulated provenance anchors by default.

### 6.2 Live Ethereum Sepolia deployment

Install `solc` in the workspace if it is not already present:

```bash
pnpm add -Dw solc
```

Set a funded Sepolia private key:

```bash
export ETHEREUM_SEPOLIA_PRIVATE_KEY=0xYOUR_PRIVATE_KEY
```

Optional: override the default Sepolia RPC endpoint:

```bash
export ETHEREUM_SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
```

Deploy the contract:

```bash
node scripts/deploy-caprov-token.mjs
```

After deployment, copy the printed contract address into `apps/api/.env`:

```env
ETHEREUM_SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
ETHEREUM_SEPOLIA_PRIVATE_KEY=0xYOUR_PRIVATE_KEY
ETHEREUM_TOKEN_CONTRACT=0xDEPLOYED_CONTRACT_ADDRESS
```

When `ETHEREUM_SEPOLIA_PRIVATE_KEY` is configured, the platform can anchor provenance hashes on Ethereum Sepolia for trusted Asset DNA snapshots and uploaded-source evidence.

## 7. Full Local Startup Order

If you want the complete platform running locally, use this order.

### Terminal 1: AI engine

```bash
./scripts/run-intelligence-engine.sh
```

### Terminal 2: backend

```bash
pnpm --filter api build
PORT=3001 node apps/api/dist/main.js
```

### Terminal 3: frontend

```bash
pnpm --filter web dev
```

## 8. Demo Login

Once everything is running, open:

```text
http://localhost:3000
```

Demo user:

- Email: `elena@meridian.caprov`
- Password: `CaprovDemo!23`

Platform admin:

- Email: `priya@caprov.io`
- Password: `CaprovDemo!23`

Useful test asset document:

- `samples/valuation-test-pack.pdf`

## 9. Verification Commands

### Frontend

```bash
pnpm --filter web typecheck
pnpm --filter web lint
```

### Backend

```bash
pnpm --filter api typecheck
pnpm --filter api test
```

### AI engine

```bash
cd apps/intelligence-engine
. .venv/bin/activate
pytest -q
```

### Full platform smoke tests

Run these only after backend, frontend, and AI engine are already running:

```bash
node scripts/smoke-platform.mjs
node scripts/test-re-valuation-accuracy.mjs
node scripts/test-capital-markets-e2e.mjs
```
