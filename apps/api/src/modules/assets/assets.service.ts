import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AssetClass,
  AssetStatus,
  CurrencyCode,
  OwnershipType,
} from '@caprov/types';
import type { AuthUser } from '../../common/types/auth-user';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { createId } from '../../infrastructure/database/ids';
import { AuditService } from '../audit/audit.service';
import { IntelligenceService } from '../intelligence/intelligence.service';

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
    return this.db.snapshot.assets
      .filter((asset) => asset.organizationId === organizationId)
      .map((asset) => this.hydrate(asset.id));
  }

  get(organizationId: string, assetId: string) {
    const asset = this.hydrate(assetId);
    if (!asset || asset.organizationId !== organizationId) {
      throw new NotFoundException('Asset not found');
    }
    return asset;
  }

  create(user: AuthUser, input: CreateAssetInput) {
    const now = new Date().toISOString();
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
      primaryImageUrl: input.primaryImageUrl,
      imageUrls: normalizeImageUrls(input.imageUrls, input.primaryImageUrl),
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
    this.db.mutate((draft) => {
      const asset = draft.assets.find((item) => item.id === assetId);
      if (!asset) {
        return;
      }
      Object.assign(asset, {
        ...input,
        status: input.status ?? asset.status,
        currency: 'USD',
        primaryImageUrl: input.primaryImageUrl ?? asset.primaryImageUrl,
        imageUrls:
          input.imageUrls != null || input.primaryImageUrl != null
            ? normalizeImageUrls(
                input.imageUrls,
                input.primaryImageUrl ?? asset.primaryImageUrl,
              )
            : asset.imageUrls,
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
    const asset = this.db.snapshot.assets.find((item) => item.id === assetId);
    if (!asset) {
      return null;
    }
    const ownerships = this.db.snapshot.ownerships.filter(
      (item) => item.assetId === assetId,
    );
    const documents = this.db.snapshot.documents.filter(
      (item) => item.assetId === assetId && item.isCurrent !== false,
    );
    const dna = this.db.snapshot.dnaSnapshots
      .filter((item) => item.assetId === assetId)
      .sort((a, b) => b.version - a.version)[0];
    const valuation = this.db.snapshot.valuations
      .filter((item) => item.assetId === assetId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const risk = this.db.snapshot.risks
      .filter((item) => item.assetId === assetId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const jobs = this.db.snapshot.jobs.filter(
      (item) => item.assetId === assetId,
    );
    return {
      ...asset,
      ownerships,
      documentCount: documents.length,
      latestDna: dna ?? null,
      latestValuation: valuation ?? null,
      latestRisk: risk ?? null,
      jobCount: jobs.length,
    };
  }
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
  return urls;
}
