# Blockchain Document Anchoring

CAPROV supports versioned document anchoring for asset documents using Ethereum Sepolia.

## Design

- Actual document files remain off-chain in CAPROV storage.
- Each upload creates a new immutable document version.
- Versioning is independent per `assetId + documentType`.
- The newest version becomes the current reference document.
- Prior versions remain available for history and verification.

## Stored Off-Chain

Each document version keeps:

- binary file in storage
- extracted text
- storage key
- off-chain URI
- version number
- previous version reference
- SHA-256 document hash

## Stored On-Chain

Each anchored version stores:

- asset id
- document id
- document type
- version
- SHA-256 document hash
- previous version hash
- off-chain URI
- anchor timestamp

Transaction hash and explorer URL are stored by CAPROV alongside the document version after anchoring.

## Ethereum Abstraction

CAPROV uses a blockchain abstraction for document anchoring:

- `BlockchainAdapter`
- `EthereumSepoliaDocumentRegistryService`

This keeps the document and asset domain logic decoupled from Ethereum-specific code so another chain can be added later.

## Contract

Sepolia anchoring uses:

- [contracts/CaprovDocumentRegistry.sol](/home/vara/Projects/Caprov/contracts/CaprovDocumentRegistry.sol)

Deploy helper:

- [scripts/deploy-document-registry.mjs](/home/vara/Projects/Caprov/scripts/deploy-document-registry.mjs)

## Environment Variables

For live Sepolia anchoring, set:

- `ETHEREUM_SEPOLIA_RPC_URL`
- `ETHEREUM_SEPOLIA_PRIVATE_KEY`
- `ETHEREUM_DOCUMENT_REGISTRY_CONTRACT`

If these are missing, CAPROV records a simulated anchor result instead of a live Sepolia write.

## Verification Flow

For a current document version, CAPROV can:

1. load the off-chain file
2. recalculate SHA-256
3. compare with the stored CAPROV hash
4. fetch the anchored on-chain hash
5. compare both values
6. return whether the document is authentic / unchanged

## API Surface

Document endpoints now support:

- listing current-only documents
- viewing version history
- verifying the current anchored document state

Relevant implementation:

- [documents.service.ts](/home/vara/Projects/Caprov/apps/api/src/modules/documents/documents.service.ts)
- [documents.controller.ts](/home/vara/Projects/Caprov/apps/api/src/modules/documents/documents.controller.ts)
- [blockchain.adapter.ts](/home/vara/Projects/Caprov/apps/api/src/infrastructure/blockchain/blockchain.adapter.ts)
- [ethereum-sepolia-document-registry.service.ts](/home/vara/Projects/Caprov/apps/api/src/infrastructure/blockchain/ethereum-sepolia-document-registry.service.ts)
