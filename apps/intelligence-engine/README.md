# CAPROV Intelligence Engine (`apps/intelligence-engine`)

FastAPI AI runtime for deterministic private-asset document intelligence.

## Scope

- Document classification
- Structured extraction (accuracy-first, provenance-linked)
- Entity resolution & relationships
- Timeline assembly
- Asset DNA envelope construction
- Valuation & risk estimates
- Engine-side copilot answers against a DNA envelope

## Non-goals

Owned by `apps/api` instead:

- Authentication / RBAC
- Asset system of record & ownership ledger
- Portfolios, audit
- Marketplace, trading, settlement, tokenization, collateral, lending
- Org LLM catalog & remote provider keys

## Run

```bash
# from repo root
./scripts/run-intelligence-engine.sh
# → http://localhost:8000/api/health
```

Or manually with the project venv:

```bash
cd apps/intelligence-engine
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

## Endpoints

Base: `http://localhost:8000/api`

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Liveness |
| `POST` | `/pipeline/asset-dna` | Build DNA envelope from asset + documents |
| `POST` | `/pipeline/copilot` | Answer a question given an envelope |

There is **no** handler for bare `GET /api` — that returns `404` by design.

## Accuracy

Parity with Nest `extraction-accuracy.ts`:

- NFKC / OCR normalization
- Score-based mark selection (doc type + as-of recency)
- Reject insurance / replacement / book values as market marks
- NAV heading false-positive guard
- Consensus boost when sources agree within 2%

See [docs/AI.md](../../docs/AI.md).

## Tests

```bash
cd apps/intelligence-engine
. .venv/bin/activate
pytest -q
```

## LLM selection

Org-level model preference is owned by `apps/api`. This service remains the deterministic CAPROV pipeline for DNA extraction.
