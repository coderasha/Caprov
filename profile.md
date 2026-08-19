# CAPROV Role Profiles

This document describes the user roles currently implemented in CAPROV, what each role is responsible for, and which product features each role can access in the current build.

## Shared platform areas

Every authenticated organization member can sign in to the web application and see the standard workspace navigation:

- Overview
- Assets
- Documents
- Intelligence
- Copilot
- Portfolios
- Marketplace
- Trading
- Settlement
- Tokenization
- Collateral
- Lending
- Organization
- Audit

The `Platform Admin` role also sees:

- Platform Admin

Important implementation note: some pages are visible in navigation for all signed-in members, but write actions on those pages are still enforced by backend RBAC. In practice, access should be understood as "page visible" versus "action permitted."

## Role matrix

| Role | Primary responsibility | Typical user |
| --- | --- | --- |
| `PLATFORM_ADMIN` | Operate the CAPROV platform across all organizations | Internal CAPROV administrator |
| `ORG_ADMIN` | Manage one organization, its members, settings, and operating workflows | Firm administrator or operations lead |
| `ANALYST` | Run day-to-day asset, document, intelligence, and market workflows | Investment or research analyst |
| `COMPLIANCE` | Review records, provenance, auditability, and settlement steps | Compliance or control officer |
| `VIEWER` | Observe workspace activity with read-only access | Executive, client, or passive stakeholder |

## PLATFORM_ADMIN

### Responsibilities

- Administer the platform across all organizations
- Switch into any tenant workspace
- Oversee member, asset, document, and portfolio activity across the system
- Perform any organization-scoped workflow when operating inside a workspace

### Features and access

- Full access to all authenticated API scopes
- Access to the `Platform Admin` screen
- Can list all organizations and inspect organization-level counts
- Can switch active workspace using the platform admin console
- Can view and update current organization settings
- Can invite users into the active organization
- Can create, update, and delete assets
- Can upload and manage documents
- Can run intelligence and copilot workflows
- Can create and manage portfolios
- Can create marketplace listings and orders
- Can create tokenization, collateral, and lending records
- Can create and complete settlements
- Can read audit history

### UI areas

- All standard workspace sections
- Platform Admin

## ORG_ADMIN

### Responsibilities

- Own organization configuration and member administration
- Manage the firm’s asset inventory and associated workflows
- Supervise intelligence and capital-markets operations within one organization

### Features and access

- Full organization-level administrative access, except cross-organization platform controls
- Can update organization name and settings
- Can invite members with roles `ORG_ADMIN`, `ANALYST`, `COMPLIANCE`, and `VIEWER`
- Can review current role definitions in the organization page
- Can choose the organization LLM model
- Can create, update, and delete assets
- Can upload and manage documents
- Can run intelligence jobs and use copilot
- Can create and manage portfolios
- Can create marketplace listings
- Can create and manage trading orders
- Can create tokenization records
- Can create and manage collateral positions
- Can create and manage loans
- Can create and complete settlements
- Can read audit history

### Limits

- Cannot use the `Platform Admin` area
- Cannot list or switch across all organizations unless also granted `PLATFORM_ADMIN`

## ANALYST

### Responsibilities

- Execute daily operating workflows around assets, documents, intelligence, and markets
- Produce and maintain asset records, research inputs, and execution artifacts

### Features and access

- Can create, update, and delete assets
- Can upload and manage documents
- Can run intelligence jobs and use copilot
- Can create and manage portfolios
- Can create marketplace listings
- Can create and manage trading orders
- Can create tokenization records
- Can create and manage collateral positions
- Can create and manage loans
- Can create and complete settlements in the current demo implementation
- Can read audit history
- Can view organization information and member roster

### Limits

- Cannot invite members
- Cannot rename the organization
- Cannot use the `Platform Admin` area

## COMPLIANCE

### Responsibilities

- Review documents, extracted intelligence, provenance, and audit history
- Participate in control-oriented operational checkpoints, especially settlement

### Features and access

- Read-only access to assets, documents, intelligence, portfolios, and audit data
- Can review organization information and member roster
- Can access marketplace, trading, tokenization, collateral, and lending pages for review purposes
- Can create and complete settlements in the current demo implementation
- Can read market activity

### Limits

- Cannot create or edit assets
- Cannot upload or manage documents
- Cannot run write intelligence operations
- Cannot create or manage portfolios
- Cannot invite members
- Cannot update organization settings
- Cannot create listings, orders, tokenization records, collateral records, or loans
- Cannot use the `Platform Admin` area

## VIEWER

### Responsibilities

- Observe workspace state without changing records
- Consume asset, portfolio, intelligence, and audit information

### Features and access

- Read-only access to assets, documents, intelligence, portfolios, and audit data
- Can review organization information and member roster
- Can read marketplace and other visible workspace screens where data is exposed to authenticated members

### Limits

- Cannot perform write actions in core workflows
- Cannot invite members
- Cannot update organization settings
- Cannot create or complete settlements
- Cannot create listings, orders, tokenization records, collateral records, or loans
- Cannot use the `Platform Admin` area

## Feature-by-feature summary

| Feature | PLATFORM_ADMIN | ORG_ADMIN | ANALYST | COMPLIANCE | VIEWER |
| --- | --- | --- | --- | --- | --- |
| Sign in and access workspace | Yes | Yes | Yes | Yes | Yes |
| View assets, documents, intelligence, portfolios, audit | Yes | Yes | Yes | Yes | Yes |
| Create or edit assets | Yes | Yes | Yes | No | No |
| Upload or manage documents | Yes | Yes | Yes | No | No |
| Run intelligence jobs and copilot workflows | Yes | Yes | Yes | No | No |
| Create or manage portfolios | Yes | Yes | Yes | No | No |
| Update organization settings | Yes | Yes | No | No | No |
| Invite organization members | Yes | Yes | No | No | No |
| View organization member roster | Yes | Yes | Yes | Yes | Yes |
| Access platform-wide organization console | Yes | No | No | No | No |
| Switch into another workspace | Yes | No | No | No | No |
| Create listings, orders, tokenization, collateral, loans | Yes | Yes | Yes | No | No |
| Create settlement | Yes | Yes | Yes | Yes | No |
| Complete settlement | Yes | Yes | Yes | Yes | No |

## Current implementation notes

- `COMPLIANCE` and `VIEWER` share the same base read scopes in the auth package.
- `COMPLIANCE` has an additional settlement exception in the capital-markets controllers and docs.
- Navigation in the web app is broad; backend decorators are the source of truth for write permissions.
- The organization page currently loads for authenticated users, but mutating actions are only permitted for `ORG_ADMIN` and `PLATFORM_ADMIN`.
