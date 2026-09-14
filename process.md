# CAPROV Product Lifecycle Architecture Assessment

## Scope and inspection result

This document records the current CAPROV implementation and the recommended product/process architecture for the lifecycle:

```text
Asset → Marketplace → Trading → Settlement → Ownership → Collateral → Lending
```

No implementation changes are proposed by this document. CAPROV is presently a NestJS modular monolith with a JSON file-backed store. `PrismaService` is currently a no-op rather than an active Prisma-backed database. The Python intelligence engine performs extraction and intelligence assistance; NestJS owns transactional business APIs.

Relevant modules are Assets, Documents, Intelligence, Audit, Marketplace, Trading, Settlement, Tokenization, Collateral, and Lending.

## Current TBW records

The user-facing listing is named **TBW Asset-Final**. Its connected canonical asset record is currently named **TBW asset** (`ast_f8689db131814ff4`); this naming difference should be resolved as a data-quality task, not by duplicating the asset.

| Area | Current finding |
| --- | --- |
| Core asset | `TBW asset`, `REAL_ESTATE`, `ACTIVE`, USD, USA / USA-New |
| Ownership | No ownership records currently exist |
| Documents | KYC, valuation memo, title-deed-like file, and a two-version cap-table lineage |
| Document anchors | Most versions have live blockchain anchors; the title-deed file is pending |
| Asset DNA | Four versioned, content-hashed snapshots |
| Valuation | Latest stored mark: USD 30 at 0.78 confidence; older fallback marks: USD 12.5 |
| Risk | Latest risk: ELEVATED, including ownership-clarity and document-coverage concerns |
| Marketplace | Partially filled listing: 10,000 bps offered, 8,500 bps remaining |
| Trading | Two filled buy orders generated trades totaling 1,500 bps / 15% |
| Settlement | Neither trade has a settlement |
| Collateral / lending | No collateral position or loan |
| Tokenization | Live Sepolia and simulated token records exist |

The two TBW trades remain `PENDING_SETTLEMENT`. The 15% transaction must therefore not be treated as a completed legal or beneficial ownership transfer.

## Current architecture and data model

The persisted model currently contains:

- `AssetRecord`, `AssetOwnershipRecord`, `DocumentRecord`, `AssetDnaSnapshotRecord`, valuation and risk snapshots, provenance facts and anchors
- `MarketplaceListing`, `TradingOrder`, `TradeRecord`, `SettlementRecord`, `TokenPosition`
- `CollateralPosition`, `LoanFacility`, organization wallets and wallet transactions
- audit events, organizations, users, memberships, portfolios, and intelligence jobs

Current missing or insufficient concepts are Offers, Seller/Buyer parties on a trade, SettlementInstruction, Payment, immutable OwnershipRecord history, OwnershipTransfer, Encumbrance, CollateralPledge, LoanApplication, LoanRepayment, and configurable eligibility/policy decisions.

`AssetOwnershipRecord` is currently a free-text, current-state record. It does not hold an owner party ID, immutable history, validity period, source evidence, causing trade/settlement, or enforceable aggregate percentage rules.

## Current module flows

### Marketplace: discovery and listing

Marketplace listings reference `assetId`, price, offered basis points, and optional token data. Hydrated listing responses include the asset, latest valuation, risk, and token. This is directionally correct: a Listing is not an Asset.

The current listing model lacks seller/beneficial owner identity, linked ownership interest, due-diligence result, encumbrance state, and eligibility decision. Listings are currently returned globally, while an order may only be created for a listing in the buyer's organization. This makes cross-organization discovery and trading inconsistent.

Marketplace should answer: **What verified ownership interests are available to acquire?**

### Trading: agreement and execution

A buyer creates an order and auto-matching immediately creates a trade. The current model tracks listing, order, asset, price, quantity, and notional.

It does not include an Offer, counteroffer, seller acceptance, buyer/seller party pair, fees, taxes, supporting documents, or a confirmation workflow. For TBW, the 10% and 5% trades are valid pending execution records, but are not yet complete ownership-transfer agreements.

Trading should answer: **What commercial transaction was agreed, by whom, at what price and quantity?**

### Settlement: fulfillment and transfer

A settlement references a trade and asset. Current completion marks the settlement `COMPLETED` and the trade `SETTLED` directly.

It lacks payment, settlement instruction, verification checkpoints, ownership transfer, and idempotency evidence. Settlement should answer: **Were payment, verification, and the legally/electronically effective transfer completed?**

### Collateral: secured pledge

Collateral references an asset, optionally a token, valuation-derived pledged value, haircut, advanceable value, status, and linked loans. It prevents a second active collateral position for the same asset/token and blocks release while active loans remain.

It does not verify the pledgor's ownership percentage, legal title, external encumbrances, document validity, or settlement restrictions. It models an asset-wide pledge, not a specific ownership interest.

Collateral should answer: **Can this ownership interest be pledged, and how much secured value does it provide?**

### Lending: credit and financing

Lending references collateral and asset, calculates availability from advanceable collateral value less outstanding loans, requires active collateral, and tracks approval, disbursal, repayment, and wallet credit.

It lacks a loan application, borrower party separate from requester, repayment ledger, agreement version, covenant/default workflow, and configurable credit/LTV policy.

Lending should answer: **How much can be lent against verified collateral, under what terms and risk conditions?**

## Recommended common foundation

The Asset remains the canonical business object. Marketplace, Trading, Settlement, Collateral, and Lending must reference it; they must not recreate asset records.

```text
Asset ← DocumentVersion / AssetDNA / Valuation / Risk
  └── OwnershipRecord (immutable history; current ownership is derived)
       ├── Listing → Offer → Order → Trade → Settlement
       └── CollateralInterest → LoanApplication → Loan → Repayment
```

## Recommended end-to-end lifecycle for TBW Asset-Final

1. Keep one canonical Asset record.
2. Upload and verify documents; preserve every document version.
3. Produce Asset DNA with source, provenance, confidence, and status.
4. Verify ownership, valuation, risk, encumbrances, and eligibility.
5. Seller creates a Listing against a specific verified ownership interest.
6. Buyer discovers the listing and reviews the asset, seller, ownership, asking price, valuation, documents, DNA, risk, due diligence, and encumbrances.
7. Buyer submits an Offer; seller accepts, rejects, or counters.
8. An accepted offer creates an executable Order and Trade.
9. Settlement creates payment and verification instructions.
10. Verify payment, buyer/seller/KYC, documents, ownership, legal restrictions, and transfer conditions.
11. Atomically complete the OwnershipTransfer only when all conditions pass.
12. Close/supersede old ownership records and create new immutable records.
13. Create Asset DNA and audit updates.
14. A verified owner may submit its ownership interest for collateral eligibility.
15. Approve and pledge eligible collateral.
16. Originate, approve, disburse, service, repay, and close a loan.
17. Release collateral after every release condition is satisfied.

Marketplace → Trading → Settlement can happen without Lending. Lending may start independently once ownership is established.

## Ownership model

Never overwrite `owner = buyer`. Maintain immutable history and derive current ownership from records whose validity window is open.

```text
OwnershipRecord
assetId, ownerPartyId, percentageBps,
validFrom, validTo,
sourceDocumentVersionIds,
causingTradeId, causingSettlementId,
verificationStatus, legalTitleStatus
```

For a settled 30% transaction from a seller owning 100%:

```text
Seller 100%, valid T1–T2  (closed at settlement)
Seller 70%,  valid from T2
Buyer 30%,   valid from T2
```

The system must answer who owns an asset, each percentage, how ownership changed, which trade/settlement caused it, and when it occurred.

Partial ownership may be collateralized only when configured legal/business policy allows the particular interest, documents, jurisdiction, and ownership agreement. An owner can normally pledge only its verified, unencumbered percentage; pledging the whole asset needs all required owners' consents and applicable authority.

## Recommended state machines

| Entity | Recommended states |
| --- | --- |
| Offer | `DRAFT → SUBMITTED → COUNTERED | ACCEPTED | REJECTED | EXPIRED | CANCELLED` |
| Trade | `PENDING_CONFIRMATION → CONFIRMED → PENDING_SETTLEMENT → SETTLING → SETTLED | FAILED | CANCELLED` |
| Settlement | `PENDING → PAYMENT_PENDING → PAYMENT_VERIFIED → VERIFICATION_PENDING → OWNERSHIP_TRANSFER_PENDING → COMPLETED`, plus `FAILED` and `CANCELLED` |
| Collateral | `ELIGIBILITY_PENDING → PENDING_APPROVAL → ACTIVE/PLEDGED → RELEASE_PENDING → RELEASED`, plus `REJECTED` and `DEFAULT_ENFORCEMENT` |
| Loan | `APPLICATION → UNDER_REVIEW → APPROVED → DISBURSED/ACTIVE → REPAID/CLOSED`, plus `REJECTED` and `DEFAULTED` |

Core asset availability should be derived from ownership interest, listing reservation, encumbrance, collateral pledge, and settlement state. Relevant availability statuses include `AVAILABLE`, `PLEDGED`, `ENCUMBERED`, `LOCKED`, `RELEASE_PENDING`, and `RELEASED`.

## Collateral and lending calculations

Collateral consumes Asset, OwnershipRecord, document versions, DNA, valuation, risk, encumbrances, and settlement history. It must verify ownership, pledged percentage, ownership verification, existing pledges/loans/encumbrances, valuation recency, document currency, restrictions, haircut, and configured eligibility.

Conceptual collateral entity:

```text
collateralId, assetId, ownerId, ownershipPercentage,
valuation, haircut, eligibleValue,
collateralStatus, pledgeStatus, pledgedAt, releasedAt,
relatedLoanId, relatedOwnershipRecordId,
relatedDocumentVersionIds, audit fields
```

Lending must consume collateral outputs rather than independently determine title or value. For an illustrative INR 1 crore asset where the borrower owns 70%, with a 30% haircut and 60% maximum LTV:

```text
Economic ownership value:  ₹70 lakh
Eligible collateral value: ₹49 lakh
Maximum secured loan:      ₹29.4 lakh
```

These figures are illustrative only. Haircuts, LTV, eligibility and terms must be configurable policy/risk rules.

## Documents and blockchain provenance

Documents stay off-chain. A document version must capture asset, category, canonical name, version, original filename, upload timestamp/uploader, hash, storage location, prior version, status, blockchain transaction hash, and anchor status.

The version identity should be:

```text
assetId + documentCategory + canonicalDocumentName
```

Blockchain remains an adapter-driven provenance layer. It can anchor document versions, completed settlement evidence, ownership transfer attestations, collateral pledge/release attestations, and loan provenance. It must not store documents on-chain, and an unavailable chain must not create a false success state.

## Asset DNA integration

Asset DNA is the intelligence layer joining documents, extraction, entity resolution, knowledge graph, valuation, risk, marketplace, trading, settlement, collateral, and lending.

Create a new versioned DNA snapshot after material events such as document upload, ownership change, valuation change, encumbrance change, completed trade/settlement, collateral pledge/release, loan creation, and repayment. AI-derived information must retain its source, provenance, confidence, and status. It must not directly mutate critical ownership or financial state.

## Audit, transaction integrity, and failures

Every material event needs immutable audit data: actor, timestamp, entity, prior state, next state, correlation/idempotency key, source references, and relevant document/anchor evidence.

Before production ownership transfers, move lifecycle data to a transactional database and use a transactional outbox/reconciliation model:

1. Persist the intended state transition and idempotency key.
2. Call an external payment/blockchain provider.
3. Persist independently verified evidence.
4. Advance the state exactly once.
5. Reconcile unknown or pending outcomes asynchronously.

Failure rules:

- Rejected/cancelled offers do not create ownership transfer.
- Payment failure leaves settlement pending or failed; ownership remains unchanged.
- Ownership/document verification failure blocks settlement completion.
- Blockchain failure records pending/failed provenance; it does not fabricate an anchor.
- Already-pledged assets/interests and LTV violations are rejected before approval.
- Collateral cannot release while outstanding obligations remain.
- Default requires a governed enforcement workflow; title must not be automatically reassigned without policy/legal authority.
- Partial settlement creates ownership only for independently verified settled tranches; the remainder stays pending or is cancelled under trade rules.

## UI responsibilities and navigation

| Route | Responsibility |
| --- | --- |
| `/marketplace` | Discover and diligence available ownership interests |
| `/trading` | Manage offers, orders, trade confirmation, fills, and exceptions |
| `/settlement` | Fulfill trades through payment, document, and ownership verification |
| `/collateral` | Assess, pledge, monitor, and release verified ownership interests |
| `/lending` | Originate, approve, disburse, service, repay, and close secured loans |

Asset detail should expose a lifecycle rail:

```text
Asset → Listing → Trade → Settlement → Ownership history → Collateral → Loan
```

Each screen should link to the exact related records rather than duplicate asset facts.

## Recommended implementation phases

1. Add parties, immutable ownership history, ownership verification, and asset eligibility read models.
2. Add offers, trade parties/economics, seller confirmation, and listing-interest reservation.
3. Replace direct settlement completion with settlement instruction, payment, verification, and ownership-transfer state machines.
4. Add encumbrance, collateral-interest/pledge, and configurable eligibility/LTV policy models.
5. Add loan application, agreement versioning, repayment ledger, servicing, and default workflows.
6. Move financial lifecycle state to a transactional database with idempotency, outbox, and reconciliation.
7. Add cross-module lifecycle navigation, controls, audit views, and blockchain-provenance enhancements.

## Product boundary summary

- **Marketplace** = discovery and listing
- **Trading** = agreement and execution
- **Settlement** = fulfillment and transfer
- **Collateral** = secured asset / pledge
- **Lending** = financing / credit

Asset, immutable OwnershipRecord history, and Asset DNA are the common foundation across every module.
