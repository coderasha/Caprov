import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AssetClass,
  AssetStatus,
  CurrencyCode,
  OwnershipType,
} from '@caprov/types';
import type { AuthUser } from '../../common/types/auth-user';
import { DatabaseService } from '../../infrastructure/database/database.service';
import type {
  AssetDnaSnapshotRecord,
  CaprovData,
} from '../../infrastructure/database/models';
import { createId } from '../../infrastructure/database/ids';
import { AuditService } from '../audit/audit.service';
import { IntelligenceService } from '../intelligence/intelligence.service';
import {
  MAX_IMAGE_BYTES,
  persistImageUrl,
  persistImageUrls,
} from '../../infrastructure/media/media-urls';

export interface CreateAssetInput {
  name: string;
  assetClass: AssetClass;
  status?: AssetStatus;
  currency?: CurrencyCode;
  jurisdiction?: string;
  location?: string;
  description?: string;
  creationDate?: string;
  primaryImageUrl?: string;
  imageUrls?: string[];
}

export interface OwnershipInput {
  holderName: string;
  ownershipType: OwnershipType;
  percentage: number;
  asOf?: string;
  notes?: string;
}

@Injectable()
export class AssetsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly intelligence: IntelligenceService,
  ) {}

  list(organizationId: string) {
    return this.hydrateMany(
      this.db.snapshot.assets.filter((asset) => asset.organizationId === organizationId),
      { slim: true },
    );
  }

  /** A lender's inventory is only the assets actively presented for credit review. */
  listForUser(user: AuthUser) {
    if (user.roles.includes('BANKER') && !user.roles.some((role) => ['ORG_ADMIN', 'ANALYST', 'PLATFORM_ADMIN'].includes(role))) {
      const collateralAssetIds = new Set(
        this.db.snapshot.collateralPositions
          .filter((position) => ['PENDING_APPROVAL', 'ACTIVE'].includes(position.status))
          .map((position) => position.assetId),
      );
      return this.hydrateMany(
        this.db.snapshot.assets.filter((asset) => collateralAssetIds.has(asset.id)),
        { slim: true },
      );
    }
    return this.list(user.organizationId);
  }

  get(organizationId: string, assetId: string) {
    const asset = this.hydrate(assetId);
    if (!asset || asset.organizationId !== organizationId) {
      throw new NotFoundException('Asset not found');
    }
    return asset;
  }

  /** Read-only lender access is limited to assets currently submitted for collateral review. */
  getForUser(user: AuthUser, assetId: string) {
    const asset = this.hydrate(assetId);
    if (!asset) throw new NotFoundException('Asset not found');
    const listedForSale =
      user.roles.includes('BUYER') &&
      this.db.snapshot.listings.some(
        (listing) =>
          listing.assetId === assetId &&
          listing.status !== 'CLOSED' &&
          listing.status !== 'CANCELLED',
      );
    if (
      asset.organizationId === user.organizationId ||
      user.roles.includes('PLATFORM_ADMIN') ||
      listedForSale ||
      (user.roles.includes('BANKER') &&
        this.db.snapshot.collateralPositions.some(
          (position) =>
            position.assetId === assetId &&
            (position.status === 'PENDING_APPROVAL' || position.status === 'ACTIVE'),
        ))
    ) {
      return asset;
    }
    throw new NotFoundException('Asset not found');
  }

  create(user: AuthUser, input: CreateAssetInput) {
    const now = new Date().toISOString();
    const imageUrls = persistImageUrls(
      normalizeImageUrls(input.imageUrls, input.primaryImageUrl),
    );
    const primaryImageUrl =
      persistImageUrl(input.primaryImageUrl) ?? imageUrls[0];
    assertImageBudget(input.primaryImageUrl, input.imageUrls);
    const asset = {
      id: createId('ast'),
      organizationId: user.organizationId,
      name: input.name,
      assetClass: input.assetClass,
      status: input.status ?? 'DRAFT',
      currency: 'USD' as CurrencyCode,
      jurisdiction: input.jurisdiction,
      location: input.location,
      description: input.description,
      creationDate: input.creationDate,
      primaryImageUrl,
      imageUrls,
      createdAt: now,
      updatedAt: now,
    };
    this.db.mutate((draft) => {
      draft.assets.unshift(asset);
    });
    this.audit.log({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'asset.created',
      entityType: 'Asset',
      entityId: asset.id,
    });
    return this.hydrate(asset.id);
  }

  update(user: AuthUser, assetId: string, input: Partial<CreateAssetInput>) {
    this.get(user.organizationId, assetId);
    if (input.primaryImageUrl != null || input.imageUrls != null) {
      assertImageBudget(input.primaryImageUrl, input.imageUrls);
    }
    this.db.mutate((draft) => {
      const asset = draft.assets.find((item) => item.id === assetId);
      if (!asset) {
        return;
      }
      const nextImageUrls =
        input.imageUrls != null || input.primaryImageUrl != null
          ? persistImageUrls(
              normalizeImageUrls(
                input.imageUrls,
                input.primaryImageUrl ?? asset.primaryImageUrl,
              ),
            )
          : asset.imageUrls;
      const nextPrimary =
        input.primaryImageUrl != null || input.imageUrls != null
          ? persistImageUrl(input.primaryImageUrl) ?? nextImageUrls?.[0]
          : asset.primaryImageUrl;
      Object.assign(asset, {
        ...input,
        status: input.status ?? asset.status,
        currency: 'USD',
        primaryImageUrl: nextPrimary,
        imageUrls: nextImageUrls,
        updatedAt: new Date().toISOString(),
      });
    });
    this.audit.log({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'asset.updated',
      entityType: 'Asset',
      entityId: assetId,
    });
    return this.hydrate(assetId);
  }

  async replaceOwnerships(
    user: AuthUser,
    assetId: string,
    inputs: OwnershipInput[],
  ) {
    this.get(user.organizationId, assetId);
    if (!inputs.length) {
      throw new BadRequestException('At least one ownership holder is required.');
    }
    const total = inputs.reduce((sum, item) => sum + Number(item.percentage), 0);
    if (Math.abs(total - 100) > 0.001) {
      throw new BadRequestException(
        'Ownership percentages must total exactly 100%. Current total: ' + total.toFixed(2) + '%.',
      );
    }
    if (inputs.some((item) => !item.holderName.trim() || item.percentage < 0 || item.percentage > 100)) {
      throw new BadRequestException('Each holder needs a name and a percentage between 0 and 100.');
    }
    const ownerships = inputs.map((input) => ({
      id: createId('own'),
      assetId,
      holderName: input.holderName.trim(),
      type: input.ownershipType,
      percentage: Number(input.percentage),
      asOf: input.asOf,
      notes: input.notes,
    }));
    this.db.mutate((draft) => {
      draft.ownerships = draft.ownerships.filter((item) => item.assetId !== assetId);
      draft.ownerships.push(...ownerships);
    });
    this.audit.log({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'asset.ownership_register_updated',
      entityType: 'Asset',
      entityId: assetId,
      metadata: { holderCount: ownerships.length, totalPercentage: total },
    });
    await this.intelligence.runPipeline(user, assetId);
    return this.hydrate(assetId);
  }

  hydrate(assetId: string) {
    return (
      this.hydrateMany(
        this.db.snapshot.assets.filter((item) => item.id === assetId),
        { slim: false },
      )[0] ?? null
    );
  }

  /**
   * Batch hydrate with one pass over related collections. List responses use a
   * slim DNA envelope so the platform shell stays responsive under large orgs.
   */
  private hydrateMany(
    assets: CaprovData['assets'],
    options: { slim: boolean },
  ) {
    if (!assets.length) return [];
    const assetIds = new Set(assets.map((asset) => asset.id));
    const ownershipsByAsset = groupByAssetId(
      this.db.snapshot.ownerships.filter((item) => assetIds.has(item.assetId)),
    );
    const documentCountByAsset = countByAssetId(
      this.db.snapshot.documents.filter(
        (item): item is typeof item & { assetId: string } =>
          Boolean(item.assetId) &&
          assetIds.has(item.assetId as string) &&
          item.isCurrent !== false,
      ),
    );
    const latestDnaByAsset = latestByAssetId(
      this.db.snapshot.dnaSnapshots.filter((item) => assetIds.has(item.assetId)),
      (item) => item.version,
    );
    const latestValuationByAsset = latestByAssetId(
      this.db.snapshot.valuations.filter((item) => assetIds.has(item.assetId)),
      (item) => item.createdAt,
    );
    const latestRiskByAsset = latestByAssetId(
      this.db.snapshot.risks.filter((item) => assetIds.has(item.assetId)),
      (item) => item.createdAt,
    );
    const jobCountByAsset = countByAssetId(
      this.db.snapshot.jobs.filter(
        (item): item is typeof item & { assetId: string } =>
          Boolean(item.assetId) && assetIds.has(item.assetId as string),
      ),
    );

    return assets.map((asset) => {
      const dna = latestDnaByAsset.get(asset.id) ?? null;
      return {
        ...asset,
        ownerships: ownershipsByAsset.get(asset.id) ?? [],
        documentCount: documentCountByAsset.get(asset.id) ?? 0,
        latestDna: options.slim ? slimDnaSnapshot(dna) : dna,
        latestValuation: latestValuationByAsset.get(asset.id) ?? null,
        latestRisk: latestRiskByAsset.get(asset.id) ?? null,
        jobCount: jobCountByAsset.get(asset.id) ?? 0,
      };
    });
  }
}

function groupByAssetId<T extends { assetId: string }>(items: T[]) {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const bucket = map.get(item.assetId);
    if (bucket) bucket.push(item);
    else map.set(item.assetId, [item]);
  }
  return map;
}

function countByAssetId<T extends { assetId: string }>(items: T[]) {
  const map = new Map<string, number>();
  for (const item of items) {
    map.set(item.assetId, (map.get(item.assetId) ?? 0) + 1);
  }
  return map;
}

function latestByAssetId<T extends { assetId: string }>(
  items: T[],
  rank: (item: T) => string | number,
) {
  const map = new Map<string, T>();
  for (const item of items) {
    const current = map.get(item.assetId);
    if (!current || rank(item) > rank(current)) {
      map.set(item.assetId, item);
    }
  }
  return map;
}

function slimDnaSnapshot(dna: AssetDnaSnapshotRecord | null) {
  if (!dna) return null;
  const facts = (dna.envelope?.facts ?? [])
    .filter((fact) =>
      /occupancy|market_value|purchase_price|legal_ownership|nav/i.test(fact.key),
    )
    .slice(0, 8)
    .map((fact) => ({
      id: fact.id,
      key: fact.key,
      label: fact.label,
      value: fact.value,
      confidence: fact.confidence,
    }));
  return {
    id: dna.id,
    assetId: dna.assetId,
    version: dna.version,
    createdAt: dna.createdAt,
    envelope: {
      summary: dna.envelope?.summary,
      confidence: dna.envelope?.confidence,
      facts,
      valuation: dna.envelope?.valuation,
      risk: dna.envelope?.risk,
    },
  };
}

function normalizeImageUrls(
  imageUrls?: string[],
  primaryImageUrl?: string,
): string[] {
  const urls = Array.from(
    new Set(
      [primaryImageUrl, ...(imageUrls ?? [])]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
  return urls.slice(0, 6);
}

function assertImageBudget(
  primaryImageUrl?: string,
  imageUrls?: string[],
): void {
  const candidates = [primaryImageUrl, ...(imageUrls ?? [])].filter(Boolean);
  for (const value of candidates) {
    if (!value?.startsWith('data:')) continue;
    const comma = value.indexOf(',');
    if (comma < 0) continue;
    const approxBytes = Math.floor(((value.length - comma - 1) * 3) / 4);
    if (approxBytes > MAX_IMAGE_BYTES) {
      throw new BadRequestException(
        `Images must be under ${Math.floor(MAX_IMAGE_BYTES / 1024)}KB. Compress the file and try again.`,
      );
    }
  }
}
