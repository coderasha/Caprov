export type EntityId = string;

export type ConfidenceScore = number;

export type IsoTimestamp = string;

export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'INR' | 'SGD';

export type AssetClass =
  | 'REAL_ESTATE'
  | 'PRIVATE_CREDIT'
  | 'PRIVATE_EQUITY'
  | 'INFRASTRUCTURE'
  | 'AVIATION'
  | 'ART'
  | 'AGRICULTURE'
  | 'FUND'
  | 'OTHER';

export type AssetStatus = 'DRAFT' | 'ACTIVE' | 'UNDER_REVIEW' | 'ARCHIVED';

export type DocumentType =
  | 'TITLE_DEED'
  | 'SPA'
  | 'PURCHASE_AGREEMENT'
  | 'VALUATION_MEMO'
  | 'SALE_AGREEMENT'
  | 'ENCUMBRANCE_CERTIFICATE'
  | 'KYC'
  | 'INSURANCE'
  | 'FINANCIAL_STATEMENT'
  | 'CAP_TABLE'
  | 'LPA'
  | 'OTHER';

export type DocumentStatus = 'UPLOADED' | 'PROCESSING' | 'READY' | 'FAILED';

export type IntelligenceJobType =
  | 'DOCUMENT_INTELLIGENCE'
  | 'EXTRACTION'
  | 'ENTITY_RESOLUTION'
  | 'KNOWLEDGE_GRAPH'
  | 'ASSET_DNA'
  | 'VALUATION'
  | 'RISK'
  | 'PROJECTION'
  | 'FULL_PIPELINE';

export type IntelligenceJobStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export type MembershipRole =
  | 'PLATFORM_ADMIN'
  | 'ORG_ADMIN'
  | 'ANALYST'
  | 'COMPLIANCE'
  | 'VIEWER';

export type OrganizationStatus = 'ACTIVE' | 'SUSPENDED';

export type OrganizationAccessRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type OwnershipType = 'LEGAL' | 'BENEFICIAL' | 'ECONOMIC';

export interface ProvenanceRef {
  sourceDocumentId: EntityId;
  sourceFragment?: string;
  confidence: ConfidenceScore;
  observedAt: IsoTimestamp;
}

export interface HealthStatus {
  service: string;
  status: 'ok' | 'degraded';
  timestamp: IsoTimestamp;
}

export interface DnaFact {
  id: EntityId;
  key: string;
  label: string;
  value: string;
  numericValue?: number;
  currency?: CurrencyCode;
  unit?: string;
  confidence: ConfidenceScore;
  provenance: ProvenanceRef[];
}

export interface DnaEntity {
  id: EntityId;
  name: string;
  type: 'ORGANIZATION' | 'PERSON' | 'ASSET' | 'LOCATION' | 'VEHICLE' | 'INSTRUMENT';
  canonicalName: string;
  aliases: string[];
  confidence: ConfidenceScore;
}

export interface DnaRelationship {
  id: EntityId;
  fromEntityId: EntityId;
  toEntityId: EntityId;
  type: string;
  confidence: ConfidenceScore;
  sourceDocumentId?: EntityId;
}

export interface DnaTimelineEvent {
  id: EntityId;
  date: string;
  title: string;
  description: string;
  category: 'OWNERSHIP' | 'VALUATION' | 'LEGAL' | 'OPERATING' | 'RISK' | 'DOCUMENT';
  confidence: ConfidenceScore;
  sourceDocumentId?: EntityId;
}

export interface ValuationSummary {
  amount: number;
  currency: CurrencyCode;
  method: string;
  asOf: IsoTimestamp;
  low?: number;
  high?: number;
  confidence: ConfidenceScore;
  notes: string[];
}

export interface ValuationProjectionHorizon {
  years: 1 | 3 | 5;
  asOf: string;
  /** Central (base) projected mark */
  base: number;
  bear: number;
  bull: number;
  low: number;
  high: number;
  annualGrowthRate: number;
  confidence: ConfidenceScore;
}

export interface ValuationProjection {
  assetId: EntityId;
  currency: CurrencyCode;
  baseAmount: number;
  baseAsOf: IsoTimestamp;
  baseMethod: string;
  model: string;
  generatedAt: IsoTimestamp;
  assumptions: {
    annualGrowthRate: number;
    drivers: string[];
    disclaimer: string;
  };
  horizons: ValuationProjectionHorizon[];
  confidence: ConfidenceScore;
  sourceDocumentIds: EntityId[];
}

export interface RiskSummary {
  overall: number;
  rating: 'LOW' | 'MODERATE' | 'ELEVATED' | 'HIGH';
  dimensions: Array<{
    key: string;
    label: string;
    score: number;
    rationale: string;
  }>;
  flags: string[];
  confidence: ConfidenceScore;
}

export interface AssetDnaEnvelope {
  assetId: EntityId;
  version: number;
  generatedAt: IsoTimestamp;
  summary: string;
  facts: DnaFact[];
  entities: DnaEntity[];
  relationships: DnaRelationship[];
  timeline: DnaTimelineEvent[];
  valuation?: ValuationSummary;
  risk?: RiskSummary;
  /** Forward valuation projection derived from the current mark + operating facts */
  projection?: ValuationProjection;
  confidence: {
    overall: number;
    coverage: number;
    provenance: number;
  };
  sourceDocumentIds: EntityId[];
}

export type ProvenanceAnchorKind = 'DOCUMENT' | 'DNA_SNAPSHOT';

export type ProvenanceAnchorStatus = 'CONFIRMED' | 'SIMULATED' | 'FAILED' | 'REUSED';

export interface ProvenanceAnchor {
  id: EntityId;
  organizationId: EntityId;
  assetId?: EntityId;
  documentId?: EntityId;
  dnaSnapshotId?: EntityId;
  kind: ProvenanceAnchorKind;
  hashAlgorithm: 'sha256';
  hashValue: string;
  status: ProvenanceAnchorStatus;
  chainId: number;
  chainName: string;
  txHash?: string;
  explorerUrl?: string;
  mode: 'LIVE' | 'SIMULATED';
  anchoredAt: IsoTimestamp;
  metadata?: Record<string, string | number | boolean>;
}

export interface TrustedAssetDnaSnapshot {
  id: EntityId;
  assetId: EntityId;
  version: number;
  createdAt: IsoTimestamp;
  envelope: AssetDnaEnvelope;
  contentHash: string;
  hashAlgorithm: 'sha256';
  trust: {
    snapshotAnchor?: ProvenanceAnchor;
    documentAnchors: ProvenanceAnchor[];
    anchoredDocumentCount: number;
    verificationState: 'VERIFIED' | 'PARTIAL' | 'PENDING';
  };
}

export interface PublicUser {
  id: EntityId;
  email: string;
  fullName: string;
  title?: string;
}

export interface AuthSession {
  token: string;
  user: PublicUser;
  organization: {
    id: EntityId;
    name: string;
    slug: string;
  };
  roles: MembershipRole[];
}

export interface RegistrationRequestReceipt {
  requestId: EntityId;
  status: OrganizationAccessRequestStatus;
  organizationName: string;
  email: string;
  message: string;
}

export interface OrganizationAccessRequest {
  id: EntityId;
  organizationName: string;
  requesterName: string;
  requesterEmail: string;
  requesterTitle?: string;
  status: OrganizationAccessRequestStatus;
  createdAt: IsoTimestamp;
  reviewedAt?: IsoTimestamp;
  reviewedByUserId?: EntityId;
  reviewNote?: string;
}

export type LlmProvider =
  | 'caprov'
  | 'cursor'
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'mistral'
  | 'meta'
  | 'xai';

export type LlmCapability = 'extraction' | 'asset_dna' | 'valuation' | 'risk' | 'copilot';

export interface LlmModelOption {
  id: string;
  provider: LlmProvider;
  label: string;
  description: string;
  contextWindow: number;
  strengths: string[];
  capabilities: LlmCapability[];
  /** True when the platform can execute this model without an external API key. */
  alwaysAvailable: boolean;
  /** Env var name required for live remote inference (if any). */
  apiKeyEnv?: string;
}

export interface LlmModelSelection {
  selectedModelId: string;
  models: LlmModelOption[];
  selected: LlmModelOption;
  availability: Record<
    string,
    {
      available: boolean;
      reason: string;
    }
  >;
}

/** Capital markets / on-chain bounded contexts */

export type ListingStatus = 'OPEN' | 'PARTIALLY_FILLED' | 'FILLED' | 'CLOSED' | 'CANCELLED';

export type ListingOfferingType = 'SALE' | 'LEASE';

export type OrderSide = 'BUY' | 'SELL';

export type OrderStatus = 'OPEN' | 'PARTIAL' | 'FILLED' | 'CANCELLED';

export type TradeStatus = 'PENDING_SETTLEMENT' | 'SETTLING' | 'SETTLED' | 'FAILED';

export type SettlementStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

export type TokenizationStatus = 'PENDING' | 'SUBMITTED' | 'CONFIRMED' | 'SIMULATED' | 'FAILED';

export type CollateralStatus =
  | 'PENDING_APPROVAL'
  | 'ACTIVE'
  | 'RELEASED'
  | 'LIQUIDATED';

export type LoanStatus =
  | 'PENDING_APPROVAL'
  | 'ACTIVE'
  | 'REPAID'
  | 'DEFAULTED'
  | 'CLOSED';

export interface OrganizationWallet {
  organizationId: EntityId;
  currency: CurrencyCode;
  balance: number;
  updatedAt: IsoTimestamp;
}

export interface WalletTransaction {
  id: EntityId;
  organizationId: EntityId;
  direction: 'CREDIT' | 'DEBIT';
  type: 'LOAN_DISBURSAL';
  amount: number;
  currency: CurrencyCode;
  description: string;
  referenceType?: 'Loan' | 'Collateral';
  referenceId?: EntityId;
  createdAt: IsoTimestamp;
  createdByUserId?: EntityId;
}

export interface MarketplaceListing {
  id: EntityId;
  organizationId: EntityId;
  assetId: EntityId;
  title: string;
  offeringType: ListingOfferingType;
  status: ListingStatus;
  summary?: string;
  imageUrl?: string;
  askPrice: number;
  currency: CurrencyCode;
  leaseRate?: number;
  leaseTermMonths?: number;
  tokenPositionId?: EntityId;
  tokenizationMode?: 'LIVE' | 'SIMULATED';
  /** Basis points of economic interest offered (10000 = 100%). */
  quantityBps: number;
  remainingBps: number;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface TradingOrder {
  id: EntityId;
  organizationId: EntityId;
  listingId: EntityId;
  assetId: EntityId;
  side: OrderSide;
  status: OrderStatus;
  price: number;
  currency: CurrencyCode;
  quantityBps: number;
  filledBps: number;
  createdByUserId: EntityId;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface TradeRecord {
  id: EntityId;
  organizationId: EntityId;
  listingId: EntityId;
  orderId: EntityId;
  assetId: EntityId;
  status: TradeStatus;
  price: number;
  currency: CurrencyCode;
  quantityBps: number;
  notional: number;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface SettlementRecord {
  id: EntityId;
  organizationId: EntityId;
  tradeId: EntityId;
  assetId: EntityId;
  status: SettlementStatus;
  method: 'OFF_CHAIN' | 'TOKENIZED_TRANSFER';
  completedAt?: IsoTimestamp;
  notes?: string;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface TokenPosition {
  id: EntityId;
  organizationId: EntityId;
  assetId: EntityId;
  status: TokenizationStatus;
  chainId: number;
  chainName: string;
  contractAddress?: string;
  tokenId: string;
  supply: number;
  recipientAddress: string;
  txHash?: string;
  explorerUrl?: string;
  mode: 'LIVE' | 'SIMULATED';
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface CollateralPosition {
  id: EntityId;
  organizationId: EntityId;
  assetId: EntityId;
  tokenId?: EntityId;
  status: CollateralStatus;
  requestedByUserId?: EntityId;
  approvedAt?: IsoTimestamp;
  approvedByUserId?: EntityId;
  pledgedValue: number;
  currency: CurrencyCode;
  haircutBps: number;
  advanceableValue: number;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface LoanFacility {
  id: EntityId;
  organizationId: EntityId;
  collateralId: EntityId;
  assetId: EntityId;
  status: LoanStatus;
  requestedByUserId?: EntityId;
  approvedByUserId?: EntityId;
  principal: number;
  currency: CurrencyCode;
  interestRateBps: number;
  termDays: number;
  outstanding: number;
  ltvBps: number;
  disbursedAt?: IsoTimestamp;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  repaidAt?: IsoTimestamp;
}
