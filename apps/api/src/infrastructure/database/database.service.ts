import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { emptyStore, type CaprovData } from './models';
import { buildSeedData } from './seed-data';
import {
  DEFAULT_LLM_MODEL_ID,
  getPreferredDefaultLlmModelId,
} from '../../modules/intelligence/llm-catalog';

@Injectable()
export class DatabaseService implements OnModuleInit {
  private data: CaprovData = emptyStore();
  private readonly filePath = resolve(
    process.cwd(),
    process.env.DATA_FILE ?? 'data/store.json',
  );
  private writeChain: Promise<void> = Promise.resolve();

  onModuleInit(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    if (process.env.RESET_DEMO === 'true' || !existsSync(this.filePath)) {
      this.data = buildSeedData();
      this.saveSync();
      return;
    }
    try {
      this.data = JSON.parse(readFileSync(this.filePath, 'utf8')) as CaprovData;
      this.normalizeStore();
    } catch {
      this.data = buildSeedData();
      this.saveSync();
    }
  }

  /** Backfill fields introduced after an existing local store was created. */
  private normalizeStore(): void {
    let changed = false;
    const seeded = buildSeedData();
    const preferredDefaultModelId = getPreferredDefaultLlmModelId();
    for (const organization of this.data.organizations) {
      if (!organization.status) {
        organization.status = 'ACTIVE';
        changed = true;
      }
      if (!organization.llmModelId) {
        organization.llmModelId = preferredDefaultModelId;
        changed = true;
      } else if (
        organization.llmModelId === DEFAULT_LLM_MODEL_ID &&
        preferredDefaultModelId !== DEFAULT_LLM_MODEL_ID &&
        !this.dbHasExplicitModelSelection(organization.id)
      ) {
        organization.llmModelId = preferredDefaultModelId;
        changed = true;
      }
    }
    const arrays: Array<keyof CaprovData> = [
      'organizationAccessRequests',
      'projections',
      'provenanceAnchors',
      'listings',
      'orders',
      'trades',
      'settlements',
      'tokens',
      'collateralPositions',
      'loans',
    ];
    for (const key of arrays) {
      if (!Array.isArray(this.data[key])) {
        (this.data as unknown as Record<string, unknown>)[key] = [];
        changed = true;
      }
    }
    for (const snapshot of this.data.dnaSnapshots) {
      if (!snapshot.hashAlgorithm) {
        snapshot.hashAlgorithm = 'sha256';
        changed = true;
      }
      if (!snapshot.contentHash) {
        snapshot.contentHash = createHash('sha256')
          .update(JSON.stringify(snapshot.envelope))
          .digest('hex');
        changed = true;
      }
    }
    for (const document of this.data.documents) {
      const groupKey = document.assetId
        ? `${document.assetId}:${document.type}`
        : `standalone:${document.id}`;
      if (!document.groupKey) {
        document.groupKey = groupKey;
        changed = true;
      }
      if (!document.version) {
        document.version = 1;
        changed = true;
      }
      if (document.isCurrent == null) {
        document.isCurrent = true;
        changed = true;
      }
      if (!document.hashAlgorithm) {
        document.hashAlgorithm = 'sha256';
        changed = true;
      }
      if (!document.offChainUri) {
        document.offChainUri = `caprov://storage/${document.storageKey}`;
        changed = true;
      }
      if (!document.anchorStatus) {
        document.anchorStatus = 'NOT_APPLICABLE';
        changed = true;
      }
    }
    for (const asset of this.data.assets) {
      const legacy = asset as typeof asset & { acquisitionDate?: string };
      if (legacy.acquisitionDate && !legacy.creationDate) {
        legacy.creationDate = legacy.acquisitionDate;
        delete legacy.acquisitionDate;
        changed = true;
      }
      if (!Array.isArray(asset.imageUrls)) {
        asset.imageUrls = asset.primaryImageUrl ? [asset.primaryImageUrl] : [];
        changed = true;
      }
      if (!asset.primaryImageUrl && asset.imageUrls.length > 0) {
        asset.primaryImageUrl = asset.imageUrls[0];
        changed = true;
      }
    }
    for (const listing of this.data.listings) {
      if (!listing.offeringType) {
        listing.offeringType = 'SALE';
        changed = true;
      }
      if (listing.summary == null) {
        listing.summary = '';
        changed = true;
      }
      if (
        listing.offeringType === 'LEASE' &&
        listing.leaseRate == null &&
        typeof listing.askPrice === 'number' &&
        listing.askPrice > 0
      ) {
        listing.leaseRate = listing.askPrice;
        changed = true;
      }
    }
    const holdingsByPortfolio = new Map<
      string,
      Array<{ id: string; weight?: number }>
    >();
    for (const holding of this.data.holdings) {
      const portfolioHoldings =
        holdingsByPortfolio.get(holding.portfolioId) ?? [];
      portfolioHoldings.push(holding);
      holdingsByPortfolio.set(holding.portfolioId, portfolioHoldings);
    }
    for (const holdings of holdingsByPortfolio.values()) {
      const normalized = normalizePortfolioWeights(holdings);
      for (const holding of holdings) {
        const nextWeight = normalized.get(holding.id);
        if (nextWeight != null && holding.weight !== nextWeight) {
          holding.weight = nextWeight;
          changed = true;
        }
      }
    }
    const seededPlatformOrg = seeded.organizations.find(
      (item) => item.id === 'org_caprov',
    );
    if (seededPlatformOrg) {
      const existingPlatformOrg = this.data.organizations.find(
        (item) => item.id === seededPlatformOrg.id,
      );
      if (!existingPlatformOrg) {
        this.data.organizations.unshift(seededPlatformOrg);
        changed = true;
      } else {
        if (existingPlatformOrg.name !== seededPlatformOrg.name) {
          existingPlatformOrg.name = seededPlatformOrg.name;
          changed = true;
        }
        if (existingPlatformOrg.slug !== seededPlatformOrg.slug) {
          existingPlatformOrg.slug = seededPlatformOrg.slug;
          changed = true;
        }
        if (!existingPlatformOrg.status) {
          existingPlatformOrg.status = seededPlatformOrg.status;
          changed = true;
        }
        if (!existingPlatformOrg.llmModelId) {
          existingPlatformOrg.llmModelId = seededPlatformOrg.llmModelId;
          changed = true;
        }
      }
    }
    const seededPlatformAdmin = seeded.users.find(
      (item) => item.id === 'usr_caprov_admin',
    );
    if (seededPlatformAdmin) {
      const legacyPlatformAdmin = this.data.users.find(
        (item) => item.email.toLowerCase() === 'admin@caprov.io',
      );
      const existingPlatformAdmin =
        this.data.users.find((item) => item.id === seededPlatformAdmin.id) ??
        legacyPlatformAdmin;
      if (!existingPlatformAdmin) {
        this.data.users.unshift(seededPlatformAdmin);
        changed = true;
      } else {
        if (existingPlatformAdmin.id !== seededPlatformAdmin.id) {
          existingPlatformAdmin.id = seededPlatformAdmin.id;
          changed = true;
        }
        if (existingPlatformAdmin.email !== seededPlatformAdmin.email) {
          existingPlatformAdmin.email = seededPlatformAdmin.email;
          changed = true;
        }
        if (existingPlatformAdmin.fullName !== seededPlatformAdmin.fullName) {
          existingPlatformAdmin.fullName = seededPlatformAdmin.fullName;
          changed = true;
        }
        if (existingPlatformAdmin.title !== seededPlatformAdmin.title) {
          existingPlatformAdmin.title = seededPlatformAdmin.title;
          changed = true;
        }
        if (
          existingPlatformAdmin.passwordHash !==
          seededPlatformAdmin.passwordHash
        ) {
          existingPlatformAdmin.passwordHash = seededPlatformAdmin.passwordHash;
          changed = true;
        }
      }
    }
    const seededPlatformMembership = seeded.memberships.find(
      (item) => item.id === 'mem_caprov_admin',
    );
    if (seededPlatformMembership) {
      const hasPlatformMembership = this.data.memberships.some(
        (item) =>
          item.userId === seededPlatformMembership.userId &&
          item.organizationId === seededPlatformMembership.organizationId &&
          item.role === 'PLATFORM_ADMIN',
      );
      if (!hasPlatformMembership) {
        this.data.memberships.unshift(seededPlatformMembership);
        changed = true;
      }
    }
    if (changed) {
      this.saveSync();
    }
  }

  get snapshot(): CaprovData {
    return this.data;
  }

  mutate<T>(fn: (draft: CaprovData) => T): T {
    const result = fn(this.data);
    void this.persist();
    return result;
  }

  private persist(): Promise<void> {
    this.writeChain = this.writeChain.then(() => {
      this.saveSync();
    });
    return this.writeChain;
  }

  private saveSync(): void {
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }

  private dbHasExplicitModelSelection(organizationId: string): boolean {
    return this.data.auditEvents.some(
      (event) =>
        event.organizationId === organizationId &&
        event.action === 'intelligence.llm_model_selected',
    );
  }
}

function normalizePortfolioWeights(
  holdings: Array<{ id: string; weight?: number }>,
): Map<string, number> {
  const result = new Map<string, number>();
  if (!holdings.length) {
    return result;
  }

  const clamped = holdings.map((holding) => clampWeight(holding.weight ?? 0));
  const total = clamped.reduce((sum, weight) => sum + weight, 0);
  const basis = total > 0 ? clamped : holdings.map(() => 100 / holdings.length);
  const basisTotal = basis.reduce((sum, weight) => sum + weight, 0);
  let allocated = 0;

  holdings.forEach((holding, index) => {
    const isLast = index === holdings.length - 1;
    const nextWeight = isLast
      ? roundWeight(100 - allocated)
      : roundWeight((basis[index]! / basisTotal) * 100);
    allocated += nextWeight;
    result.set(holding.id, nextWeight);
  });

  return result;
}

function clampWeight(value: number) {
  return roundWeight(Math.min(100, Math.max(0, value)));
}

function roundWeight(value: number) {
  return Math.round(value * 100) / 100;
}
