# CAPROV Intelligence Engine

This document explains how CAPROV's intelligence layer works, with special focus on the `CAPROV Deterministic Extractor`, the Asset DNA pipeline, confidence scoring, optional LLM usage, and copilot behavior.

## Overview

CAPROV's AI layer is not a single black-box model. It is a layered intelligence system with clear separation between:

- deterministic extraction
- optional LLM-assisted gap filling
- Python engine enrichment
- copilot synthesis
- API orchestration and persistence

The core design goal is accuracy, provenance, and repeatability for private-asset workflows.

## Main Components

### `apps/api`

The NestJS API is the orchestrator and system of record. It:

- stores assets, documents, snapshots, jobs, audit records, and copilot threads
- runs the local deterministic pipeline
- optionally calls the Python intelligence engine
- optionally calls remote LLMs for copilot answers
- anchors provenance hashes through the Ethereum Sepolia adapter

### `apps/intelligence-engine`

The Python service is an enrichment runtime. It can build an Asset DNA envelope and answer copilot-style questions, but the API keeps local deterministic extraction authoritative.

### `apps/web`

The web app exposes:

- document and asset review
- Asset DNA views
- valuation, risk, and projection views
- copilot chat
- LLM model selection

## What the CAPROV Deterministic Extractor Is

The `CAPROV Deterministic Extractor` is the built-in extraction engine used for Asset DNA and valuation/risk inputs.

It is:

- rule-based, not purely generative
- provenance-first
- repeatable across runs
- available without any external API key

It is designed to extract structured private-asset facts from document text and to prefer accuracy over fluency.

It does not attempt to understand every sentence in a document. Instead, it targets known, high-value fields and derives higher-level analysis from those structured facts.

## What It Extracts

The deterministic layer looks for labeled fields such as:

- `market_value`
- `nav`
- `purchase_price`
- `legal_ownership`
- `proprietor`
- `location`
- `occupancy`
- `walt`
- `wale`
- `nia`
- `commitment`
- `called_capital`
- `current_yield`
- `serial_number`
- `hectares`
- `airframe_hours`
- `cap_rate`
- `passing_rent`

These come from expanded regex-based field specifications in the extraction pipeline.

## End-to-End Flow

### 1. Document text arrives

The system works on extracted document text, not raw PDFs directly inside the deterministic logic. Earlier stages handle upload and text extraction.

### 2. Text normalization

The extractor normalizes OCR and copy/paste noise before matching:

- Unicode normalization (`NFKC`)
- quote cleanup
- dash cleanup
- whitespace cleanup
- newline cleanup

This improves match stability across messy source documents.

### 3. Document classification

Each document is classified using filename and content hints into types like:

- `TITLE_DEED`
- `SPA`
- `VALUATION_MEMO`
- `INSURANCE`
- `KYC`
- `LPA`
- `FINANCIAL_STATEMENT`
- `OTHER`

Classification matters because document type affects both extraction priority and confidence.

### 4. Candidate fact extraction

For each supported field, the system scans the normalized text for matching patterns and creates candidate facts with:

- `key`
- `label`
- `value`
- parsed numeric/currency/unit fields when possible
- confidence
- provenance fragment
- source document id

### 5. Candidate scoring and winner selection

If multiple candidates exist for the same field, CAPROV does not just keep the first one. It ranks them using:

- field base confidence
- document-type bonus
- document-type priority
- as-of recency for marks like `market_value` and `nav`
- field-specific priority rules

Examples:

- `market_value` prefers `VALUATION_MEMO` and `FINANCIAL_STATEMENT`
- `purchase_price` gets extra preference from `SPA`
- `legal_ownership` gets extra preference from `TITLE_DEED`

### 6. Bad-source rejection

Certain value types are explicitly blocked from becoming a primary market mark.

The system rejects non-market substitutes like:

- declared value
- insured value
- sum insured
- replacement cost
- reinstatement value
- book value

That prevents a common failure mode where the system would otherwise treat insurance or accounting figures as real market valuation.

### 7. Consensus boost

If multiple corroborating value candidates agree closely, confidence can be boosted slightly. This is intended to reward cross-document consistency.

### 8. Derived Asset DNA outputs

Once facts are selected, CAPROV derives:

- entities
- relationships
- timeline events
- valuation summary
- risk summary
- forward projection

These are assembled into an `AssetDnaEnvelope`.

## Asset DNA Envelope

The Asset DNA envelope is the central intelligence object. It contains:

- summary
- facts
- entities
- relationships
- timeline
- valuation
- risk
- projection
- confidence
- source document ids

This is the object later used by copilot and downstream platform modules.

## How Valuation Is Built

Valuation is not guessed from scratch every time.

The system first chooses a preferred value fact:

1. market value
2. NAV
3. purchase price
4. fallback heuristic if nothing explicit is found

Then it builds a valuation summary with:

- amount
- currency
- method
- as-of date
- low/high band
- confidence
- notes

Notes explain why the chosen mark won, such as:

- market value preferred over acquisition price
- NAV used when available
- fallback to purchase price
- heuristic placeholder when no reliable value exists

## How Risk Is Built

Risk is derived from extracted facts plus coverage signals. It is not an LLM opinion.

The current risk snapshot considers factors like:

- document coverage
- ownership clarity
- jurisdiction presence
- occupancy
- WALT/WALE

It produces:

- `overall`
- `rating`
- `dimensions`
- `flags`
- `confidence`

Examples of flags:

- missing title / ownership evidence
- no independent valuation memo / NAV pack
- thin document coverage
- occupancy weakness
- lease roll risk

## How Projection Is Built

Projection is a forward valuation model derived from the current mark and asset facts.

It uses:

- current valuation confidence
- asset-class defaults
- occupancy
- WALT/WALE
- cap rate
- purchase-price drift
- risk rating

Confidence decays as the horizon extends, so 1-year projections are more confident than 5-year projections.

## Confidence Scoring

Confidence in CAPROV is heuristic and rule-driven, not a calibrated model probability.

### Fact confidence

Each fact starts with a field-level `baseConfidence`.

Examples:

- high-confidence fields: legal ownership, purchase price
- lower-confidence fields: cap rate, passing rent, WALT

Then confidence is adjusted by document type bonuses, such as:

- `VALUATION_MEMO`
- `FINANCIAL_STATEMENT`
- `TITLE_DEED`

Some fields are deliberately capped lower even when found, especially where the system wants to avoid false precision.

### Winner selection score

When several candidates compete, ranking uses:

- confidence
- document type priority
- recency of valuation date / as-of date for value marks

This means the highest final fact is not necessarily the highest raw confidence candidate.

### Envelope confidence

The envelope stores:

- `coverage`
- `provenance`
- `overall`

Current logic:

- `coverage` increases with number of ingested source documents
- `provenance` is the average fact confidence
- `overall = coverage * 0.4 + provenance * 0.6`

### Risk confidence

Risk confidence is simpler than fact confidence. In the current implementation it is effectively:

- `0.88` when documents exist
- `0.4` when they do not

### Projection confidence

Projection confidence is derived from valuation confidence, then reduced for risk and horizon length.

## Optional LLM Gap Fill

The deterministic extractor is the primary system, but CAPROV can optionally ask a live LLM to fill missing fields.

This is tightly constrained.

### What it can fill

It only attempts a limited gap list, such as:

- `market_value`
- `nav`
- `purchase_price`
- `legal_ownership`
- `occupancy`
- `walt`
- `wale`
- `cap_rate`
- `passing_rent`

### Safety rules

LLM gap fill:

- only runs if a live model is configured
- never overrides the deterministic extractor's existing high-confidence facts
- requires the proposed value to actually appear in source text
- requires the proposed source fragment to appear in source text
- rejects non-market value fragments
- only accepts `market_value` and `nav` from valuation or financial documents

So the LLM is used as a constrained recovery tool, not as the main extractor.

## Python Intelligence Engine Enrichment

After local deterministic extraction, the API tries to call the Python engine.

If the Python engine is reachable:

- it can return a full Asset DNA envelope
- the API may use it to enrich entities, relationships, and timeline

If the Python engine is unreachable:

- the API falls back entirely to local deterministic extraction

Important: local deterministic marks remain accuracy-authoritative. The Python engine does not replace them blindly.

## Copilot Layer

Copilot is separate from extraction.

### Local copilot baseline

The API can answer questions locally using the Asset DNA envelope and selected document excerpts.

This is the deterministic fallback path.

### Remote copilot synthesis

If a live model is selected, the app can use:

- OpenAI
- Anthropic
- Google
- Mistral
- xAI
- OpenAI-compatible provider
- Cursor Agent

These models do not replace the extracted facts. They synthesize answers from:

- asset summary
- valuation summary
- risk summary
- extracted facts
- excerpts from source documents

So the model is mainly answering over CAPROV's structured context, not re-parsing the full raw document set on every question.

### Cursor integration

Cursor is integrated through the official `cursor-agent` CLI path rather than a direct OpenAI-style chat endpoint.

The runtime:

- checks for `CURSOR_API_KEY`
- checks that `cursor-agent` is installed
- runs Cursor from a neutral working directory
- instructs it not to edit files or run commands for standard copilot synthesis

## Provenance and Trust

Every extracted fact aims to keep provenance:

- source document id
- source fragment
- confidence
- observed time

Snapshots are then:

- canonicalized
- hashed with `sha256`
- stored as versioned DNA snapshots
- optionally anchored through the Ethereum Sepolia adapter

This makes the intelligence layer reviewable and tamper-resistant.

## What CAPROV Does Not Do

The intelligence layer does not:

- replace legal system-of-record ownership
- manage portfolios, trading, settlement, collateral, or lending logic
- fully understand every sentence in a document
- guarantee that all document information is extracted
- let LLMs invent unsupported facts

Instead, it focuses on extracting the fields it knows how to support well, and then building analysis from those fields.

## Practical Summary

If you upload private-asset documents, CAPROV currently works like this:

1. text is extracted from files
2. text is normalized
3. documents are classified
4. supported fields are extracted deterministically
5. bad market-value substitutes are filtered out
6. best candidates are ranked and selected
7. Asset DNA, valuation, risk, and projection are built
8. optional LLM gap fill can recover missing fields under strict validation
9. optional Python engine can enrich graph outputs
10. copilot answers are generated from the resulting Asset DNA context

## Key Takeaway

The `CAPROV Deterministic Extractor` is the authoritative fact engine. The rest of the AI layer is built around it:

- deterministic extraction for reliability
- constrained LLM assist for missing fields
- Python engine enrichment for broader graph outputs
- model-based copilot synthesis for better user-facing answers

That architecture is what lets CAPROV be both explainable and practical for asset intelligence workflows.
