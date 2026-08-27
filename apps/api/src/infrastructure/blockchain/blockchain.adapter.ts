export type DocumentAnchorMode = 'LIVE' | 'SIMULATED';

export type DocumentAnchorStatus =
  | 'NOT_APPLICABLE'
  | 'PENDING'
  | 'BLOCKCHAIN_ANCHORED'
  | 'SIMULATED'
  | 'ANCHOR_FAILED';

export interface DocumentVersionAnchorRequest {
  assetId: string;
  documentId: string;
  documentType: string;
  version: number;
  documentHash: string;
  previousVersionHash?: string;
  offChainUri: string;
  timestamp: string;
}

export interface DocumentVersionAnchorResult {
  status: Extract<
    DocumentAnchorStatus,
    'BLOCKCHAIN_ANCHORED' | 'SIMULATED' | 'ANCHOR_FAILED'
  >;
  mode: DocumentAnchorMode;
  chainId: number;
  chainName: string;
  contractAddress?: string;
  transactionHash: string;
  explorerUrl: string;
  anchoredAt: string;
  blockchainReference: string;
  error?: string;
}

export interface AnchoredDocumentVersionRecord {
  assetId: string;
  documentId: string;
  documentType: string;
  version: number;
  documentHash: string;
  previousVersionHash?: string;
  offChainUri: string;
  anchoredAt: string;
  blockchainReference: string;
  chainId: number;
  chainName: string;
  contractAddress?: string;
}

export interface BlockchainAdapterNetworkStatus {
  chainId: number;
  chainName: string;
  rpcUrl: string;
  explorerBase: string;
  contractAddress?: string;
  walletAddress?: string;
  mode: DocumentAnchorMode;
  liveReady: boolean;
  message: string;
}

export interface BlockchainAdapter {
  getDocumentNetworkStatus(): BlockchainAdapterNetworkStatus;
  buildDocumentBlockchainReference(
    assetId: string,
    documentType: string,
  ): string;
  anchorDocumentVersion(
    request: DocumentVersionAnchorRequest,
  ): Promise<DocumentVersionAnchorResult>;
  getAnchoredDocumentVersion(
    blockchainReference: string,
    version: number,
  ): Promise<AnchoredDocumentVersionRecord | null>;
}

export const DOCUMENT_BLOCKCHAIN_ADAPTER = 'DOCUMENT_BLOCKCHAIN_ADAPTER';
