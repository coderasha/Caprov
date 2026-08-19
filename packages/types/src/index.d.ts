export type EntityId = string;
export type ConfidenceScore = number;
export type IsoTimestamp = string;
export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'INR' | 'SGD';
export type AssetClass = 'REAL_ESTATE' | 'PRIVATE_CREDIT' | 'PRIVATE_EQUITY' | 'INFRASTRUCTURE' | 'AVIATION' | 'ART' | 'AGRICULTURE' | 'FUND' | 'OTHER';
export type AssetStatus = 'DRAFT' | 'ACTIVE' | 'UNDER_REVIEW' | 'ARCHIVED';
export type DocumentType = 'TITLE_DEED' | 'SPA' | 'VALUATION_MEMO' | 'KYC' | 'INSURANCE' | 'FINANCIAL_STATEMENT' | 'CAP_TABLE' | 'LPA' | 'OTHER';
export type DocumentStatus = 'UPLOADED' | 'PROCESSING' | 'READY' | 'FAILED';
export type IntelligenceJobType = 'DOCUMENT_INTELLIGENCE' | 'EXTRACTION' | 'ENTITY_RESOLUTION' | 'KNOWLEDGE_GRAPH' | 'ASSET_DNA' | 'VALUATION' | 'RISK' | 'FULL_PIPELINE';
export type IntelligenceJobStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
export type MembershipRole = 'PLATFORM_ADMIN' | 'ORG_ADMIN' | 'ANALYST' | 'COMPLIANCE' | 'VIEWER';
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
