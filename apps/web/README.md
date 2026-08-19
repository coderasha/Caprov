# CAPROV Web (`apps/web`)

Next.js operator / analyst console for CAPROV.

## Run

```bash
# from repo root (API should be on :3001)
pnpm --filter web dev
# → http://localhost:3000
```

Set `NEXT_PUBLIC_API_URL` if the API is not at `http://localhost:3001/api`.

## Features

- Landing + login / approval-gated register
- Authenticated shell with **responsive** layout (desktop sidebar; mobile hamburger drawer)
- Overview, Assets, Documents, Intelligence, Copilot, Portfolios
- Capital markets: Marketplace, Trading, Settlement, Tokenization, Collateral, Lending
- Organization (members + LLM picker), Platform Admin, Audit
- Document upload with extracted fact tables
- Trusted Asset DNA views with versioning, hashes, and provenance anchors

## Stack notes

- App Router under `src/app`
- TanStack Query for API data
- Zustand auth store (persisted token)
- Shared UI in `src/components` (PageHeader, Caprov branding, DNA/copilot widgets)

## Docs

- Root [README.md](../../README.md)
- [docs/capital-markets.md](../../docs/capital-markets.md)
- [docs/AI.md](../../docs/AI.md)
