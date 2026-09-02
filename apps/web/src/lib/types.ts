import type {
  AssetClass,
  AssetDnaEnvelope,
  AssetStatus,
  CurrencyCode,
  DocumentType,
  IntelligenceJobStatus,
  IntelligenceJobType,
  MembershipRole,
  OrganizationStatus,
  OrganizationAccessRequestStatus,
  OwnershipType,
  RiskSummary,
  ValuationSummary,
} from '@caprov/types';

export interface HydratedAsset {
  id: string;
  organizationId: string;
  name: string;
  assetClass: AssetClass;
  status: AssetStatus;
  currency: CurrencyCode;
  jurisdiction?: string;
  location?: string;
  description?: string;
  creationDate?: string;
  primaryImageUrl?: string;
  imageUrls?: string[];
  createdAt: string;
  updatedAt: string;
  ownerships: Array<{
    id: string;
    holderName: string;
    type: OwnershipType;
    percentage: number;
    asOf?: string;
    notes?: string;
  }>;
  documentCount: number;
  latestDna: { version: number; envelope: AssetDnaEnvelope; createdAt: string } | null;
  latestValuation: { payload: ValuationSummary; createdAt: string } | null;
  latestRisk: { payload: RiskSummary; createdAt: string } | null;
  jobCount: number;
}

export interface DocumentRow {
  id: string;
  assetId?: string;
  name: string;
  originalFilename?: string;
  type: DocumentType;
  status: string;
  sizeBytes: number;
  createdAt: string;
  extractedText?: string;
  version?: number;
  isCurrent?: boolean;
  versionStatus?: 'CURRENT' | 'PREVIOUS';
  previousDocumentId?: string;
  uploadedByUserId?: string;
  uploadedBy?: string | null;
  storageKey?: string;
  offChainUri?: string;
  folderName?: string;
  documentHash?: string;
  previousVersionHash?: string;
  anchorStatus?: string;
  anchorMode?: 'LIVE' | 'SIMULATED';
  anchorChainId?: number;
  anchorChainName?: string;
  anchorContractAddress?: string;
  anchorTxHash?: string;
  anchorExplorerUrl?: string;
  anchoredAt?: string;
  blockchainReference?: string;
}

export interface AssetDocumentFolder {
  type: DocumentType;
  folderName: string;
  documentCount: number;
  totalVersions: number;
  entries: Array<{
    id: string;
    name: string;
    originalFilename: string;
    currentVersion: number;
    versionCount: number;
    uploadedAt: string;
    uploadedByUserId?: string;
    uploadedBy: string | null;
    status: 'CURRENT' | 'PREVIOUS';
    documentStatus: string;
    anchorStatus?: string;
    storageKey: string;
    versions: DocumentRow[];
  }>;
}

export interface AssetDocumentsTree {
  asset: { id: string; name: string };
  folders: AssetDocumentFolder[];
}

export interface JobRow {
  id: string;
  assetId?: string;
  type: IntelligenceJobType;
  status: IntelligenceJobStatus;
  createdAt: string;
  completedAt?: string;
}

export interface PortfolioRow {
  id: string;
  name: string;
  description?: string;
  baseCurrency: CurrencyCode;
  holdingCount: number;
  holdings: Array<{
    id: string;
    assetId: string;
    weight?: number;
    asset: { id: string; name: string; assetClass: AssetClass; currency: CurrencyCode } | null;
    valuation: { payload: ValuationSummary } | null;
    risk: { payload: RiskSummary } | null;
  }>;
}

export interface MemberRow {
  id: string;
  email: string;
  fullName: string;
  title?: string;
  role: MembershipRole;
  joinedAt: string;
}

export interface AuditRow {
  id: string;
  action: string;
  entityType: string;
  entityId?: string;
  createdAt: string;
  actorUserId?: string;
}

export interface PlatformOrganizationRow {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  suspendedAt?: string;
  suspensionNote?: string;
  llmModelId?: string;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
  orgAdminCount: number;
  assetCount: number;
  documentCount: number;
  portfolioCount: number;
}

export interface OrganizationAccessRequestRow {
  id: string;
  organizationName: string;
  requesterName: string;
  requesterEmail: string;
  requesterTitle?: string;
  status: OrganizationAccessRequestStatus;
  createdAt: string;
  reviewedAt?: string;
  reviewedByUserId?: string;
  reviewNote?: string;
}
