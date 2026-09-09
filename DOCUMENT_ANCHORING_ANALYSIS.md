# Document Anchoring Transaction ID Analysis
*Analysis Date: September 2, 2026*

## Executive Summary

Document anchoring in Caprov uses a **wallet-signed, frontend-initiated** model where:
1. Users sign transactions in their browser (MetaMask) on Ethereum Sepolia
2. Transaction ID is captured after execution
3. Transaction ID is sent to backend for recording in the database
4. Backend verifies the transaction on-chain before recording

---

## 1. Transaction Creation & Initiation

### Where Transactions Are Created
**File:** [apps/web/src/app/(platform)/assets/[id]/page.tsx](apps/web/src/app/(platform)/assets/[id]/page.tsx#L282-L326)

**Function:** `anchorDocumentWithWallet(document, session)`
- **Line 282-326:** Async function that initiates wallet-signed anchoring

**Flow:**
1. **Line 294:** Gets the `anchorDocumentVersion` function from smart contract
2. **Line 301-308:** Calls contract function with document metadata:
   ```typescript
   const tx = await anchorFn(
     document.assetId,
     document.id,
     document.type,
     document.name,
     BigInt(document.version ?? 1),
     normalizeHash(document.documentHash),
     normalizeHash(document.previousVersionHash),
     document.offChainUri,
   );
   ```
3. **Line 309:** Awaits receipt: `const receipt = await tx.wait();`
4. **Line 310:** Extracts hash: `const transactionHash = receipt?.hash ?? tx.hash;`

**Smart Contract ABI:**
**File:** [apps/web/src/app/(platform)/assets/[id]/page.tsx](apps/web/src/app/(platform)/assets/[id]/page.tsx#L90)

**Line 90:** Function signature:
```
function anchorDocumentVersion(string assetId, string documentId, string documentType, string documentName, uint256 version, bytes32 documentHash, bytes32 previousVersionHash, string offChainUri)
```

---

## 2. Transaction Hash Generation & Reception

### Hash Generation Sources
**Primary Source:** Ethers.js receipt object

**File:** [apps/web/src/app/(platform)/assets/[id]/page.tsx](apps/web/src/app/(platform)/assets/[id]/page.tsx#L309-L314)

- **Line 309:** `const receipt = await tx.wait();`
  - Waits for transaction confirmation
  - Receipt contains the confirmed transaction hash
  
- **Line 310:** `const transactionHash = receipt?.hash ?? tx.hash;`
  - **Primary:** Uses receipt.hash (confirmed hash)
  - **Fallback:** Falls back to tx.hash (submitted hash)
  - Both are 66-character Ethereum transaction hashes (0x + 64 hex chars)

### Secondary: Backend Transaction Discovery
**File:** [apps/api/src/infrastructure/blockchain/ethereum-sepolia-document-registry.service.ts](apps/api/src/infrastructure/blockchain/ethereum-sepolia-document-registry.service.ts#L250-L295)

**Function:** `findAnchorTransaction()` - **Line 250-295**
- Queries blockchain for `DocumentVersionAnchored` event logs
- **Line 262-263:** Searches last 10,000 blocks
- **Line 268:** Matches expected document hash with event parameters
- **Returns:** Found transaction hash from event log

**Location Details:**
- **Line 262:** `const logs = await input.contract.queryFilter(event, -10_000, 'latest');`
- **Line 270-281:** Event matching criteria includes:
  - lineageKey (derived from assetId, documentType, documentName)
  - assetId, documentId, documentType, documentName
  - version, documentHash

---

## 3. Database Transaction ID Storage

### Storage Location
**File:** [apps/api/src/infrastructure/database/models.ts](apps/api/src/infrastructure/database/models.ts#L101-L142)

**DocumentRecord Interface - Line 101:**
```typescript
export interface DocumentRecord {
  // ... other fields ...
  anchorTxHash?: string;              // Line 132 - Transaction hash
  anchorExplorerUrl?: string;         // Line 133 - Explorer link
  anchorStatus?: DocumentAnchorStatus; // Line 122-128 - Status enum
  anchorMode?: 'LIVE' | 'SIMULATED';  // Line 129 - Mode
  anchorChainId?: number;             // Line 130 - Ethereum Sepolia chain ID
  anchorChainName?: string;           // Line 131 - Network name
  anchorContractAddress?: string;     // Line 132 - Registry contract address
  anchoredAt?: string;                // Line 134 - ISO timestamp
  blockchainReference?: string;       // Line 135 - Keccak256 hash key
}
```

### Storage Implementation
**File:** [apps/api/src/modules/documents/documents.service.ts](apps/api/src/modules/documents/documents.service.ts#L266-L340)

**Function:** `recordWalletAnchor()` - **Lines 266-340**

**Storage Operation - Lines 315-328:**
```typescript
this.db.mutate((draft) => {
  const target = draft.documents.find((item) => item.id === document.id);
  if (!target) {
    return;
  }
  target.anchorStatus = 'BLOCKCHAIN_ANCHORED';
  target.anchorMode = 'LIVE';
  target.anchorChainId = network.chainId;
  target.anchorChainName = network.chainName;
  target.anchorContractAddress = network.contractAddress;
  target.anchorTxHash = transactionHash;           // ← STORED HERE
  target.anchorExplorerUrl = explorerUrl;
  target.anchoredAt = onChain.anchoredAt;
  target.blockchainReference = document.blockchainReference;
});
```

### Database Implementation Details
**File:** [apps/api/src/infrastructure/database/database.service.ts](apps/api/src/infrastructure/database/database.service.ts#L286-L300)

- **In-memory store** backed by JSON file (`data/store.json`)
- **Line 290-293:** `mutate()` function applies updates and triggers async persistence
- **No database transactions or locks** - mutations are applied directly to memory
- **Chain:** `this.writeChain.then()` ensures sequential file writes

---

## 4. Transaction ID Return to Frontend

### API Response Path
**File:** [apps/api/src/modules/documents/documents.controller.ts](apps/api/src/modules/documents/documents.controller.ts#L109-L115)

**Endpoint:** `POST /documents/:id/anchor`
- **Line 109:** Route decorator
- **Line 112-114:** Handler calls `recordWalletAnchor()` and returns result

**File:** [apps/api/src/modules/documents/documents.service.ts](apps/api/src/modules/documents/documents.service.ts#L340)

- **Line 340:** Returns `this.get(user.organizationId, document.id);`
- Returns full DocumentRecord with all anchor fields populated

### Frontend Consumption
**File:** [apps/web/src/app/(platform)/assets/[id]/page.tsx](apps/web/src/app/(platform)/assets/[id]/page.tsx#L176-L185)

**Lines 176-185:** Mutation hook
```typescript
const recordAnchor = useMutation({
  mutationFn: async (data: { documentId: string; transactionHash: string; walletAddress: string }) => {
    const response = await fetch(`/api/documents/${data.documentId}/anchor`, {
      method: 'POST',
      body: JSON.stringify({
        transactionHash: data.transactionHash,
        walletAddress: data.walletAddress,
      }),
    });
    return response.json();
  },
  // ... handlers ...
});
```

**Display:** [apps/web/src/app/(platform)/documents/[id]/page.tsx](apps/web/src/app/(platform)/documents/[id]/page.tsx#L114-L121)

- **Line 114:** `const transactionId = verify?.transactionHash ?? document.anchorTxHash;`
- **Line 116-121:** Generates explorer link and displays transaction hash

---

## 5. Transaction ID Validation & Verification

### Format Validation
**File:** [apps/api/src/modules/documents/documents.controller.ts](apps/api/src/modules/documents/documents.controller.ts#L54-L60)

**RecordWalletAnchorDto - Lines 54-60:**
```typescript
class RecordWalletAnchorDto {
  @IsString()
  @MinLength(10)
  transactionHash!: string;

  @IsString()
  @MinLength(10)
  walletAddress!: string;
}
```

**Current Validation:**
- ✅ String type check
- ✅ Minimum length (10 chars)
- ❌ **NO regex validation for 0x + 64 hex chars**
- ❌ **NO checksum validation**

### Hash Normalization
**File:** [apps/api/src/infrastructure/blockchain/ethereum-sepolia-document-registry.service.ts](apps/api/src/infrastructure/blockchain/ethereum-sepolia-document-registry.service.ts#L334-L350)

**Line 334-341:** `normalizeHash()` function
```typescript
function normalizeHash(value?: string): string {
  if (!value) {
    return `0x${'0'.repeat(64)}`;
  }
  const hash = value.startsWith('0x') ? value : `0x${value}`;
  return hash.slice(0, 66).padEnd(66, '0');
}
```

**Line 342-350:** `normalizeReturnedHash()` function
- Handles returned hashes from blockchain
- Filters out zero-filled hashes

### Explorer URL Validation
**File:** [apps/api/src/infrastructure/blockchain/explorer.ts](apps/api/src/infrastructure/blockchain/explorer.ts#L1-L14)

**Line 5-14:** `sepoliaTxExplorerUrl()`
```typescript
const TX_HASH = /0x[a-fA-F0-9]{64}/;

export function sepoliaTxExplorerUrl(hashOrUrl?: string | null): string | undefined {
  if (!hashOrUrl?.trim()) {
    return undefined;
  }
  const value = hashOrUrl.trim();
  const hash = value.match(TX_HASH)?.[0];
  if (!hash) {
    return undefined;
  }
  return `${SEPOLIA_EXPLORER_BASE}/tx/${hash}`;
}
```

**Validation:** ✅ Strict regex pattern `0x[a-fA-F0-9]{64}`

### On-Chain Hash Verification
**File:** [apps/api/src/modules/documents/documents.service.ts](apps/api/src/modules/documents/documents.service.ts#L286-L299)

**Lines 286-299:** Hash matching before storage
```typescript
const onChain = await this.blockchain.getAnchoredDocumentVersion(
  document.blockchainReference,
  document.version,
);
if (!onChain) {
  throw new BadRequestException(
    'The document version could not be found on Ethereum Sepolia.',
  );
}
if (onChain.documentHash.toLowerCase() !== normalizeStoredHash(document.documentHash)) {
  throw new BadRequestException(
    'The on-chain document hash does not match the stored document hash.',
  );
}
```

---

## 6. Potential Race Conditions & Edge Cases

### CRITICAL: Race Condition in `recordWalletAnchor()`

**Issue Location:** [apps/api/src/modules/documents/documents.service.ts](apps/api/src/modules/documents/documents.service.ts#L274-L328)

**Problem:**
1. **Line 274:** Fetch document snapshot from database
2. **Line 288:** Async call to blockchain to verify document
3. **Line 315-328:** Mutate database with stored data

**Race Condition:**
- Between lines 274 and 328, another request could modify the document
- If frontend sends TWO requests with different transaction hashes simultaneously:
  - Both queries pass line 288 verification
  - Both proceed to line 315
  - Database writes are not atomic
  - **Last write wins** - could lose first transaction

**Example Scenario:**
```
Request A: recordWalletAnchor(docId, tx=0x1234...)
Request B: recordWalletAnchor(docId, tx=0x5678...)

T1: A reads document
T2: B reads document
T3: A verifies on-chain → passes
T4: B verifies on-chain → passes
T5: A mutates DB: anchorTxHash = 0x1234
T6: B mutates DB: anchorTxHash = 0x5678  ← OVERWRITES 0x1234
```

**Result:** First transaction ID is lost

### Medium: Missing Transaction Hash Format Validation

**Location:** [apps/api/src/modules/documents/documents.controller.ts](apps/api/src/modules/documents/documents.controller.ts#L54-L60)

**Issue:** `RecordWalletAnchorDto` only validates:
- String type ✅
- MinLength(10) ✅

**Missing:**
- No regex pattern validation (should be `0x[a-fA-F0-9]{64}`)
- Invalid hashes get through validation
- Example: `"0x1234567890abcdef"` (too short) passes @MinLength(10)

**Actual Transaction Hash Format:**
- Must start with `0x`
- Followed by exactly 64 hexadecimal characters
- Total length: 66 characters

### Medium: Optional Transaction Hash Fallback

**Location:** [apps/api/src/modules/documents/documents.service.ts](apps/api/src/modules/documents/documents.service.ts#L303-L310)

**Line 303-304:**
```typescript
const transactionHash =
  onChain.transactionHash ?? input.transactionHash;
```

**Issue:**
- If `getAnchoredDocumentVersion()` finds the document on-chain but fails to extract transaction hash
- Falls back to user-provided hash
- **Could store unverified user input if on-chain lookup fails**

**Scenario:**
1. Transaction is mined but `findAnchorTransaction()` fails (log query error)
2. `onChain.transactionHash` is undefined
3. User-provided transactionHash is stored without verification
4. ❌ Unverified hash stored in database

### Medium: Event Log Query Window Too Small

**Location:** [apps/api/src/infrastructure/blockchain/ethereum-sepolia-document-registry.service.ts](apps/api/src/infrastructure/blockchain/ethereum-sepolia-document-registry.service.ts#L262-L263)

**Line 262-263:**
```typescript
const logs = await input.contract.queryFilter(
  event,
  -10_000,  // ← SEARCHES ONLY LAST 10,000 BLOCKS
  'latest',
);
```

**Issue:**
- Ethereum Sepolia: ~1 block every 12 seconds
- 10,000 blocks ≈ 33 hours of history
- If RPC lag, network delays, or backend processing delays exceed this:
  - Transaction confirmation query will miss the event log
  - Event won't be found
  - Fallback to user-provided hash

### Low: No Idempotency Key or Duplicate Prevention

**Location:** [apps/api/src/modules/documents/documents.service.ts](apps/api/src/modules/documents/documents.service.ts#L315-L328)

**Issue:**
- No idempotency key or duplicate detection
- If frontend retries the same anchor request:
  - Backend will process it twice
  - Database will be updated twice
  - Audit trail will have duplicate entries

**Related:** [apps/api/src/modules/documents/documents.controller.ts](apps/api/src/modules/documents/documents.controller.ts#L109-L115)

### Low: Timestamp Conversion Edge Case

**Location:** [apps/api/src/infrastructure/blockchain/ethereum-sepolia-document-registry.service.ts](apps/api/src/infrastructure/blockchain/ethereum-sepolia-document-registry.service.ts#L147-L149)

**Line 147-149:**
```typescript
const anchoredAt = receipt.blockNumber
  ? await this.resolveBlockTimestamp(provider, receipt.blockNumber)
  : request.timestamp;  // ← FALLBACK TO REQUEST TIME
```

**Issue:**
- If `resolveBlockTimestamp()` fails or returns undefined
- Falls back to client-provided timestamp
- Could record incorrect anchor time

---

## 7. Data Flow Summary Table

| Step | Location | Component | Operation | Output |
|------|----------|-----------|-----------|--------|
| 1 | Frontend (React) | `anchorDocumentWithWallet()` | Call contract function | `tx` object |
| 2 | Ethereum Sepolia | Smart Contract | Execute transaction | Receipt + hash |
| 3 | Frontend (React) | `recordAnchor.mutateAsync()` | Send to backend | HTTP POST |
| 4 | Backend (NestJS) | `recordAnchor()` endpoint | Validate DTO | RecordWalletAnchorDto |
| 5 | Backend (NestJS) | `recordWalletAnchor()` | Read document | DocumentRecord |
| 6 | Backend (NestJS) | `getAnchoredDocumentVersion()` | Query blockchain | AnchoredDocumentVersionRecord |
| 7 | Backend (NestJS) | `findAnchorTransaction()` | Search event logs | txHash from event |
| 8 | Backend (NestJS) | `db.mutate()` | Update in-memory DB | DocumentRecord saved |
| 9 | Backend (NestJS) | `get()` | Load updated doc | DocumentRecord returned |
| 10 | Frontend (React) | UI display | Render explorer link | Transaction ID visible |

---

## 8. Key Files & Functions Reference

### Blockchain & Contract Interaction
| File | Key Functions | Lines |
|------|---------------|-------|
| [ethereum-sepolia-document-registry.service.ts](apps/api/src/infrastructure/blockchain/ethereum-sepolia-document-registry.service.ts) | `anchorDocumentVersion()` | 85-176 |
| | `getAnchoredDocumentVersion()` | 189-243 |
| | `findAnchorTransaction()` | 250-295 |
| | `normalizeHash()` | 334-341 |
| | `normalizeReturnedHash()` | 342-350 |

### Document Service
| File | Key Functions | Lines |
|------|---------------|-------|
| [documents.service.ts](apps/api/src/modules/documents/documents.service.ts) | `recordWalletAnchor()` | 266-340 |
| | `verify()` | 169-256 |
| | `resolveBestAnchorEvidence()` | 536-595 |
| | `findLatestDocumentAnchor()` | 522-535 |
| | `create()` | 353-500 |

### API Controllers & DTOs
| File | Components | Lines |
|------|-----------|-------|
| [documents.controller.ts](apps/api/src/modules/documents/documents.controller.ts) | `RecordWalletAnchorDto` | 54-60 |
| | `recordAnchor()` endpoint | 109-115 |

### Data Models
| File | Component | Lines |
|------|-----------|-------|
| [models.ts](apps/api/src/infrastructure/database/models.ts) | `DocumentRecord` | 101-142 |
| | `BlockchainAdapter` | 69-81 |
| | `AnchoredDocumentVersionRecord` | 38-54 |

### Frontend Integration
| File | Functions | Lines |
|------|-----------|-------|
| [assets/[id]/page.tsx](apps/web/src/app/(platform)/assets/[id]/page.tsx) | `anchorDocumentWithWallet()` | 282-326 |
| | `recordAnchor` mutation | 176-185 |

---

## 9. Recommendations

### Critical Priority
1. **Add transaction hash validation** using regex `0x[a-fA-F0-9]{64}` in RecordWalletAnchorDto
2. **Implement request-level locking** to prevent concurrent updates to same document anchor
3. **Add idempotency key** support for retry safety

### High Priority
1. **Increase event log search window** from 10,000 to 50,000+ blocks
2. **Require verified on-chain hash** - remove fallback to unverified user input
3. **Add transaction hash confirmation timeout** if not found on-chain within N seconds

### Medium Priority
1. **Add database-level uniqueness constraint** on document anchor transactions
2. **Implement audit trail reconciliation** to detect and log concurrent update conflicts
3. **Add monitoring** for failed on-chain verification lookups

### Low Priority
1. **Consider implementing idempotent operations** with transaction IDs
2. **Add TypeScript strict validation** for all hash inputs
3. **Document transaction ID lifecycle** in code comments

