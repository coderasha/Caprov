# Asset DNA

Asset DNA is the canonical **intelligence envelope** for an asset.

It is **not** the legal source of truth for asset existence or ownership. Those remain in the CAPROV core platform (`assets`, ownership records, documents). Asset DNA aggregates extracted facts, derived relationships, confidence scores, provenance, timelines, and downstream intelligence outputs such as valuation, risk, and forward projections.

In the current platform, Asset DNA also acts as a **versioned trusted internal intelligence layer**: every rebuild creates a new snapshot with a deterministic content hash and linked provenance anchors.

## Principles

- **Versioned** over time (each pipeline run may produce a new snapshot).
- **Linked** back to source documents and extraction jobs.
- **Hash-verifiable** through canonicalized snapshot content and `sha256` hashing.
- **Anchorable** through Ethereum Sepolia adapters for tamper-resistant provenance records.
- **Confidence-scored** at the fact level; candidates ranked by document type + as-of recency (not confidence alone).
- **Separated** from authoritative ownership ledgers and from capital-markets booking.
- **Consumable** by marketplace, trading, settlement, tokenization, collateral, and lending without changing the core asset model — those modules reference `assetId` and DNA marks.

## Envelope contents

Typical fields persisted by the API:

- `summary`
- `facts[]` (with `provenance`)
- `entities[]`, `relationships[]`, `timeline[]`
- `valuation`, `risk`
- `projection` (forward marks — API / local pipeline)
- `confidence`, `sourceDocumentIds`, `engine`, `generatedAt`
- `version`, `contentHash`, `hashAlgorithm`
- `provenanceAnchors[]` for supporting documents and the snapshot itself

## Trust model

Each saved snapshot can be reviewed as an internal golden-source candidate:

- The envelope is canonicalized and hashed before persistence.
- Uploaded source documents that contributed facts can receive their own provenance anchors.
- The snapshot hash can also be anchored as an auditable evidence record.
- In simulated mode, the platform still stores anchor metadata and explorer-style references so the workflow remains testable without live chain credentials.

## How capital markets use DNA

| Consumer | Uses |
| --- | --- |
| Marketplace listings | Default ask from latest valuation mark |
| Collateral | Default pledged value from latest mark; haircut → advanceable |
| Lending | LTV vs pledged DNA-backed value |
| Copilot / DNA UI | Operator explanation of marks, risk, and sources |

See [AI.md](../AI.md) for extraction and pipeline details, and [capital-markets.md](../capital-markets.md) for markets APIs.
