import { BadRequestException, Injectable } from '@nestjs/common';
import type { LlmModelOption, LlmModelSelection } from '@caprov/types';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { AuditService } from '../audit/audit.service';
import {
  getLlmModelAvailability,
  getLlmModel,
  getPreferredDefaultLlmModelId,
  LLM_MODEL_CATALOG,
} from './llm-catalog';

@Injectable()
export class LlmModelsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  list(organizationId: string): LlmModelSelection {
    const selectedModelId = this.getSelectedModelId(organizationId);
    const selected = getLlmModel(selectedModelId);
    const dnaSelectedModelId = this.getDnaSelectedModelId(organizationId);
    const dnaSelected = getLlmModel(dnaSelectedModelId);
    const availability = Object.fromEntries(
      LLM_MODEL_CATALOG.map((model) => [
        model.id,
        getLlmModelAvailability(model),
      ]),
    );
    return {
      selectedModelId,
      selected,
      dnaSelectedModelId,
      dnaSelected,
      models: LLM_MODEL_CATALOG,
      availability,
    };
  }

  getSelectedModelId(organizationId: string): string {
    const organization = this.db.snapshot.organizations.find(
      (item) => item.id === organizationId,
    );
    return organization?.llmModelId || getPreferredDefaultLlmModelId();
  }

  getSelectedModel(organizationId: string): LlmModelOption {
    return getLlmModel(this.getSelectedModelId(organizationId));
  }

  getDnaSelectedModelId(organizationId: string): string {
    const organization = this.db.snapshot.organizations.find(
      (item) => item.id === organizationId,
    );
    // DNA remains deterministic by default until an organization opts into a model.
    return organization?.dnaLlmModelId || 'caprov-deterministic';
  }

  getDnaSelectedModel(organizationId: string): LlmModelOption {
    return getLlmModel(this.getDnaSelectedModelId(organizationId));
  }

  select(
    organizationId: string,
    actorUserId: string,
    modelId: string,
  ): LlmModelSelection {
    const model = LLM_MODEL_CATALOG.find((item) => item.id === modelId);
    if (!model) {
      throw new BadRequestException(`Unknown model: ${modelId}`);
    }
    this.db.mutate((draft) => {
      const organization = draft.organizations.find(
        (item) => item.id === organizationId,
      );
      if (!organization) {
        return;
      }
      organization.llmModelId = modelId;
      organization.updatedAt = new Date().toISOString();
    });
    this.audit.log({
      organizationId,
      actorUserId,
      action: 'intelligence.llm_model_selected',
      entityType: 'Organization',
      entityId: organizationId,
      metadata: { modelId, provider: model.provider, label: model.label },
    });
    return this.list(organizationId);
  }

  selectDna(
    organizationId: string,
    actorUserId: string,
    modelId: string,
  ): LlmModelSelection {
    const model = LLM_MODEL_CATALOG.find((item) => item.id === modelId);
    if (!model) {
      throw new BadRequestException(`Unknown model: ${modelId}`);
    }
    if (!model.capabilities.includes('asset_dna')) {
      throw new BadRequestException(`${model.label} does not support Asset DNA`);
    }
    this.db.mutate((draft) => {
      const organization = draft.organizations.find(
        (item) => item.id === organizationId,
      );
      if (!organization) return;
      organization.dnaLlmModelId = modelId;
      organization.updatedAt = new Date().toISOString();
    });
    this.audit.log({
      organizationId,
      actorUserId,
      action: 'intelligence.dna_llm_model_selected',
      entityType: 'Organization',
      entityId: organizationId,
      metadata: { modelId, provider: model.provider, label: model.label },
    });
    return this.list(organizationId);
  }
}
