import type {
  AssetClass,
  AssetDnaEnvelope,
  AssetStatus,
  CollateralPosition,
  CurrencyCode,
  DocumentStatus,
  DocumentType,
  IntelligenceJobStatus,
  IntelligenceJobType,
  LoanFacility,
  MarketplaceListing,
  MembershipRole,
  OrganizationStatus,
  OrganizationAccessRequestStatus,
  OwnershipType,
  ProvenanceAnchor,
  RiskSummary,
  SettlementRecord,
  TokenPosition,
  TradeRecord,
  TradingOrder,
  ValuationProjection,
  ValuationSummary,
} from '@caprov/types';

export interface OrganizationRecord {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  suspendedAt?: string;
  suspensionNote?: string;
  llmModelId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MembershipRecord {
  id: string;
  organizationId: string;
  userId: string;
  role: MembershipRole;
  createdAt: string;
}

export interface OrganizationAccessRequestRecord {
  id: string;
  organizationName: string;
  requestedSlug: string;
  requesterEmail: string;
  requesterName: string;
  requesterTitle?: string;
  passwordHash: string;
  status: OrganizationAccessRequestStatus;
  createdAt: string;
  reviewedAt?: string;
  reviewedByUserId?: string;
  reviewNote?: string;
}

export interface AssetRecord {
  id: string;
  organizationId: string;
  name: string;
  assetClass: AssetClass;
  status: AssetStatus;
  currency: CurrencyCode;
  jurisdiction?: string;
  location?: string;
  description?: string;
  acquisitionDate?: string;
  primaryImageUrl?: string;
  imageUrls?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AssetOwnershipRecord {
  id: string;
  assetId: string;
  holderName: string;
  type: OwnershipType;
  percentage: number;
  asOf?: string;
  notes?: string;
}

export interface DocumentRecord {
  id: string;
  organizationId: string;
  assetId?: string;
  name: string;
  type: DocumentType;
  status: DocumentStatus;
  mimeType: string;
  storageKey: string;
  sizeBytes: number;
  extractedText?: string;
  groupKey: string;
  version: number;
  isCurrent: boolean;
  previousDocumentId?: string;
  previousVersionHash?: string;
  documentHash?: string;
  hashAlgorithm?: 'sha256';
  offChainUri?: string;
  anchorStatus?:
    | 'NOT_APPLICABLE'
    | 'PENDING'
    | 'BLOCKCHAIN_ANCHORED'
    | 'SIMULATED'
    | 'ANCHOR_FAILED';
  anchorMode?: 'LIVE' | 'SIMULATED';
  anchorChainId?: number;
  anchorChainName?: string;
  anchorContractAddress?: string;
  anchorTxHash?: string;
  anchorExplorerUrl?: string;
  anchoredAt?: string;
  blockchainReference?: string;
  createdAt: string;
}

export interface PortfolioRecord {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  baseCurrency: CurrencyCode;
  createdAt: string;
  updatedAt: string;
}

export interface PortfolioHoldingRecord {
  id: string;
  portfolioId: string;
  assetId: string;
  weight?: number;
  notes?: string;
}

export interface AuditEventRecord {
  id: string;
  organizationId: string;
  actorUserId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface IntelligenceJobRecord {
  id: string;
  organizationId: string;
  assetId?: string;
  documentId?: string;
  type: IntelligenceJobType;
  status: IntelligenceJobStatus;
  result?: Record<string, unknown>;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

export interface AssetDnaSnapshotRecord {
  id: string;
  assetId: string;
  version: number;
  envelope: AssetDnaEnvelope;
  contentHash: string;
  hashAlgorithm: 'sha256';
  createdAt: string;
}

export interface ProvenanceAnchorRecord extends ProvenanceAnchor {}

export interface ValuationSnapshotRecord {
  id: string;
  assetId: string;
  payload: ValuationSummary;
  createdAt: string;
}

export interface ProjectionSnapshotRecord {
  id: string;
  assetId: string;
  payload: ValuationProjection;
  createdAt: string;
}

export interface RiskSnapshotRecord {
  id: string;
  assetId: string;
  payload: RiskSummary;
  createdAt: string;
}

export interface ProvenanceFactRecord {
  id: string;
  documentId: string;
  key: string;
  value: string;
  confidence: number;
  fragment?: string;
  observedAt: string;
}

export interface CopilotThreadRecord {
  id: string;
  organizationId: string;
  userId: string;
  assetId?: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface CopilotMessageRecord {
  id: string;
  threadId: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Array<{ label: string; documentId?: string }>;
  briefing?: {
    title: string;
    headline: string;
    metric?: string;
    metricLabel?: string;
    confidence?: number;
    sections: Array<{
      title: string;
      body: string;
      kind?: 'metric' | 'detail' | 'note' | 'list';
    }>;
    disclaimer?: string;
  };
  createdAt: string;
}

export interface CaprovData {
  organizations: OrganizationRecord[];
  users: UserRecord[];
  memberships: MembershipRecord[];
  organizationAccessRequests: OrganizationAccessRequestRecord[];
  assets: AssetRecord[];
  ownerships: AssetOwnershipRecord[];
  documents: DocumentRecord[];
  portfolios: PortfolioRecord[];
  holdings: PortfolioHoldingRecord[];
  auditEvents: AuditEventRecord[];
  jobs: IntelligenceJobRecord[];
  dnaSnapshots: AssetDnaSnapshotRecord[];
  valuations: ValuationSnapshotRecord[];
  projections: ProjectionSnapshotRecord[];
  risks: RiskSnapshotRecord[];
  provenanceAnchors: ProvenanceAnchorRecord[];
  facts: ProvenanceFactRecord[];
  copilotThreads: CopilotThreadRecord[];
  copilotMessages: CopilotMessageRecord[];
  listings: MarketplaceListing[];
  orders: TradingOrder[];
  trades: TradeRecord[];
  settlements: SettlementRecord[];
  tokens: TokenPosition[];
  collateralPositions: CollateralPosition[];
  loans: LoanFacility[];
}

export function emptyStore(): CaprovData {
  return {
    organizations: [],
    users: [],
    memberships: [],
    organizationAccessRequests: [],
    assets: [],
    ownerships: [],
    documents: [],
    portfolios: [],
    holdings: [],
    auditEvents: [],
    jobs: [],
    dnaSnapshots: [],
    valuations: [],
    projections: [],
    risks: [],
    provenanceAnchors: [],
    facts: [],
    copilotThreads: [],
    copilotMessages: [],
    listings: [],
    orders: [],
    trades: [],
    settlements: [],
    tokens: [],
    collateralPositions: [],
    loans: [],
  };
}
