import { createHash } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  AssetDnaEnvelope,
  IntelligenceJobType,
  ProvenanceAnchor,
  TrustedAssetDnaSnapshot,
} from '@caprov/types';
import type { AuthUser } from '../../common/types/auth-user';
import { EthereumSepoliaTokenService } from '../../infrastructure/blockchain/ethereum-sepolia-token.service';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { createId } from '../../infrastructure/database/ids';
import type {
  IntelligenceJobRecord,
  ProvenanceAnchorRecord,
  AssetOwnershipRecord,
} from '../../infrastructure/database/models';
import { AuditService } from '../audit/audit.service';
import {
  answerCopilot,
  runLocalPipeline,
  type PipelineAsset,
  type PipelineDocument,
} from './local-pipeline';
import { assistExtractionGaps } from './llm-assist-extraction';
import { isLlmModelLive } from './llm-catalog';
import { LlmModelsService } from './llm-models.service';
import { resolveCopilotAnswer } from './llm-runtime';
import { attachProjection } from './projection-engine';

type ComposedEnvelope = {
  envelope: AssetDnaEnvelope;
  extractionEngine: 'caprov-deterministic' | 'llm-primary';
  note?: string;
};

@Injectable()
export class IntelligenceService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly llmModels: LlmModelsService,
    private readonly sepolia: EthereumSepoliaTokenService,
  ) {}

  listJobs(organizationId: string) {
    return this.db.snapshot.jobs.filter(
      (job) => job.organizationId === organizationId,
    );
  }

  getDna(organizationId: string, assetId: string) {
    this.assertAsset(organizationId, assetId);
    return this.db.snapshot.dnaSnapshots
      .filter((item) => item.assetId === assetId)
      .sort((a, b) => b.version - a.version)
      .map((snapshot) => this.toTrustedSnapshot(organizationId, snapshot.id));
  }

  getValuation(organizationId: string, assetId: string) {
    this.assertAsset(organizationId, assetId);
    return this.db.snapshot.valuations
      .filter((item) => item.assetId === assetId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getProjection(organizationId: string, assetId: string) {
    this.assertAsset(organizationId, assetId);
    return this.db.snapshot.projections
      .filter((item) => item.assetId === assetId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getRisk(organizationId: string, assetId: string) {
    this.assertAsset(organizationId, assetId);
    return this.db.snapshot.risks
      .filter((item) => item.assetId === assetId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async runPipeline(
    user: AuthUser,
    assetId: string,
    type: IntelligenceJobType = 'FULL_PIPELINE',
  ) {
    const asset = this.assertAsset(user.organizationId, assetId);
    const documents = this.db.snapshot.documents.filter(
      (item) =>
        item.assetId === assetId &&
        item.organizationId === user.organizationId &&
        item.isCurrent !== false,
    );
    const job: IntelligenceJobRecord = {
      id: createId('job'),
      organizationId: user.organizationId,
      assetId,
      type,
      status: 'RUNNING',
      createdAt: new Date().toISOString(),
    };
    this.db.mutate((draft) => {
      draft.jobs.unshift(job);
    });

    try {
      const composed = await this.composeEnvelope(
        asset,
        documents,
        user.organizationId,
      );
      const ownerships = this.db.snapshot.ownerships.filter(
        (item) => item.assetId === assetId,
      );
      const envelope = applyOwnershipRegister(composed.envelope, ownerships);
      const version =
        Math.max(
          0,
          ...this.db.snapshot.dnaSnapshots
            .filter((item) => item.assetId === assetId)
            .map((item) => item.version),
        ) + 1;
      envelope.version = version;
      const now = new Date().toISOString();
      const snapshotId = createId('dna');
      const contentHash = sha256(canonicalStringify(envelope));
      const documentAnchors = await this.anchorSourceDocuments(
        user.organizationId,
        asset.id,
        documents,
        now,
      );
      const snapshotAnchor = await this.anchorSnapshot(
        user.organizationId,
        asset.id,
        snapshotId,
        contentHash,
        now,
      );

      const selectedModel = this.llmModels.getDnaSelectedModel(
        user.organizationId,
      );
      this.db.mutate((draft) => {
        const current = draft.jobs.find((item) => item.id === job.id);
        if (current) {
          current.status = 'COMPLETED';
          current.completedAt = now;
          current.result = {
            dnaVersion: version,
            confidence: envelope.confidence,
            dnaLlmModelId: selectedModel.id,
            dnaLlmModelLabel: selectedModel.label,
            extractionEngine: composed.extractionEngine,
            note: composed.note,
          };
        }
        draft.dnaSnapshots.push({
          id: snapshotId,
          assetId,
          version,
          envelope,
          contentHash,
          hashAlgorithm: 'sha256',
          createdAt: now,
        });
        draft.provenanceAnchors.push(...documentAnchors, snapshotAnchor);
        if (envelope.valuation) {
          draft.valuations.push({
            id: createId('val'),
            assetId,
            payload: envelope.valuation,
            createdAt: now,
          });
        }
        if (envelope.projection) {
          draft.projections.push({
            id: createId('prj'),
            assetId,
            payload: envelope.projection,
            createdAt: now,
          });
        }
        if (envelope.risk) {
          draft.risks.push({
            id: createId('rsk'),
            assetId,
            payload: envelope.risk,
            createdAt: now,
          });
        }
        for (const fact of envelope.facts) {
          const documentId = fact.provenance[0]?.sourceDocumentId;
          if (!documentId) {
            continue;
          }
          draft.facts.push({
            id: fact.id,
            documentId,
            key: fact.key,
            value: fact.value,
            confidence: fact.confidence,
            fragment: fact.provenance[0]?.sourceFragment,
            observedAt: now,
          });
        }
      });

      this.audit.log({
        organizationId: user.organizationId,
        actorUserId: user.id,
        action: 'intelligence.pipeline_completed',
        entityType: 'Asset',
        entityId: assetId,
        metadata: { jobId: job.id, version, type },
      });

      return this.db.snapshot.jobs.find((item) => item.id === job.id);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Pipeline failed';
      this.db.mutate((draft) => {
        const current = draft.jobs.find((item) => item.id === job.id);
        if (current) {
          current.status = 'FAILED';
          current.error = message;
          current.completedAt = new Date().toISOString();
        }
      });
      throw error;
    }
  }

  async chat(
    user: AuthUser,
    input: { message: string; assetId?: string; threadId?: string },
  ) {
    const asset = input.assetId
      ? this.assertAsset(user.organizationId, input.assetId)
      : undefined;
    const documents = input.assetId
      ? this.db.snapshot.documents.filter(
          (item) => item.assetId === input.assetId && item.isCurrent !== false,
        )
      : [];
    const envelope = input.assetId
      ? this.db.snapshot.dnaSnapshots
          .filter((item) => item.assetId === input.assetId)
          .sort((a, b) => b.version - a.version)[0]?.envelope
      : undefined;

    const selectedModel = this.llmModels.getSelectedModel(user.organizationId);
    const local = this.answerWithEngineFallback(
      input.message,
      envelope,
      documents,
    );
    const context = this.buildCopilotContext(envelope, documents, asset?.name);
    const resolved = await resolveCopilotAnswer({
      model: selectedModel,
      question: input.message,
      context,
      localAnswer: local.answer,
    });

    const briefing =
      resolved.mode === 'deterministic'
        ? local.briefing
        : createSynthesisBriefing(resolved.answer, resolved.note);

    const answer =
      resolved.mode === 'deterministic'
        ? local.answer
        : resolved.note
          ? `${resolved.answer}\n\n${resolved.note}`
          : resolved.answer;

    const now = new Date().toISOString();
    const thread =
      (input.threadId &&
        this.db.snapshot.copilotThreads.find(
          (item) =>
            item.id === input.threadId &&
            item.organizationId === user.organizationId,
        )) ||
      this.db.mutate((draft) => {
        const created = {
          id: createId('thd'),
          organizationId: user.organizationId,
          userId: user.id,
          assetId: input.assetId,
          title: input.message.slice(0, 72),
          createdAt: now,
          updatedAt: now,
        };
        draft.copilotThreads.unshift(created);
        return created;
      });

    this.db.mutate((draft) => {
      draft.copilotMessages.push(
        {
          id: createId('msg'),
          threadId: thread.id,
          role: 'user',
          content: input.message,
          createdAt: now,
        },
        {
          id: createId('msg'),
          threadId: thread.id,
          role: 'assistant',
          content: answer,
          citations: local.citations,
          briefing,
          createdAt: new Date().toISOString(),
        },
      );
      const current = draft.copilotThreads.find(
        (item) => item.id === thread.id,
      );
      if (current) {
        current.updatedAt = new Date().toISOString();
        current.title = current.title || input.message.slice(0, 72);
      }
    });

    return {
      threadId: thread.id,
      assetName: asset?.name,
      answer,
      citations: local.citations,
      briefing,
      model: {
        id: selectedModel.id,
        label: selectedModel.label,
        provider: selectedModel.provider,
        mode: resolved.mode,
        live: isLlmModelLive(selectedModel),
        note: resolved.note,
      },
      messages: this.db.snapshot.copilotMessages.filter(
        (item) => item.threadId === thread.id,
      ),
    };
  }

  listThreads(user: AuthUser) {
    return this.db.snapshot.copilotThreads
      .filter((item) => item.organizationId === user.organizationId)
      .map((thread) => ({
        ...thread,
        messages: this.db.snapshot.copilotMessages.filter(
          (item) => item.threadId === thread.id,
        ),
      }));
  }

  private assertAsset(organizationId: string, assetId: string) {
    const asset = this.db.snapshot.assets.find(
      (item) => item.id === assetId && item.organizationId === organizationId,
    );
    if (!asset) {
      throw new NotFoundException('Asset not found');
    }
    return asset;
  }

  private answerWithEngineFallback(
    question: string,
    envelope: AssetDnaEnvelope | undefined,
    documents: PipelineDocument[],
  ) {
    // Local answer is authoritative for accuracy; optionally enrich via engine in parallel later.
    return answerCopilot(question, envelope, documents);
  }

  private buildCopilotContext(
    envelope: AssetDnaEnvelope | undefined,
    documents: PipelineDocument[],
    assetName?: string,
  ): string {
    const lines: string[] = [];
    if (assetName) {
      lines.push(`Asset: ${assetName}`);
    }
    if (envelope?.summary) {
      lines.push(`Summary: ${envelope.summary}`);
    }
    if (envelope?.valuation) {
      lines.push(
        `Valuation: ${envelope.valuation.amount} ${envelope.valuation.currency} (${envelope.valuation.asOf})`,
      );
    }
    if (envelope?.risk) {
      lines.push(`Risk: ${envelope.risk.rating} (${envelope.risk.overall})`);
    }
    for (const fact of envelope?.facts?.slice(0, 24) ?? []) {
      lines.push(`Fact ${fact.key}: ${String(fact.value)}`);
    }
    for (const document of documents.slice(0, 8)) {
      const excerpt = (document.extractedText ?? '').slice(0, 400);
      if (excerpt) {
        lines.push(`Document ${document.name}: ${excerpt}`);
      }
    }
    return lines.join('\n').slice(0, 12_000);
  }

  private async composeEnvelope(
    asset: PipelineAsset,
    documents: PipelineDocument[],
    organizationId: string,
  ): Promise<ComposedEnvelope> {
    let local = runLocalPipeline(asset, documents);
    const model = this.llmModels.getDnaSelectedModel(organizationId);
    let extractionEngine: ComposedEnvelope['extractionEngine'] =
      'caprov-deterministic';
    let extractionNote: string | undefined;

    // An opted-in live DNA model receives the entire supported fact set. Its
    // output becomes authoritative only when every accepted fact is grounded in
    // the uploaded source text; otherwise the deterministic result is retained.
    const primary = await assistExtractionGaps({ model, documents, facts: [] });
    if (primary.filled.length) {
      local = runLocalPipeline(asset, documents, { facts: primary.facts });
      extractionEngine = 'llm-primary';
      extractionNote = `Primary extraction via ${model.label}. ${primary.note ?? ''}`.trim();
    } else {
      const assist = await assistExtractionGaps({
        model,
        documents,
        facts: local.facts,
      });
      if (assist.filled.length) {
        local = runLocalPipeline(asset, documents, { facts: assist.facts });
        extractionNote = assist.note;
      }
      local = {
        ...local,
        summary: `${local.summary} ${assist.note ?? ''}`.trim(),
      };
    }

    const engineUrl =
      process.env.INTELLIGENCE_ENGINE_URL ?? 'http://localhost:8000';
    try {
      const health = await fetch(`${engineUrl}/api/health`, {
        signal: AbortSignal.timeout(1500),
      });
      if (!health.ok) {
        return { envelope: { ...local, summary: `${local.summary} (local intelligence fallback)` }, extractionEngine, note: extractionNote };
      }
      const response = await fetch(`${engineUrl}/api/pipeline/asset-dna`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          asset,
          documents: documents.map((document) => ({
            id: document.id,
            name: document.name,
            type: document.type,
            text: document.extractedText ?? '',
          })),
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        return { envelope: { ...local, summary: `${local.summary} (local intelligence fallback)` }, extractionEngine, note: extractionNote };
      }
      const remote = (await response.json()) as AssetDnaEnvelope & {
        engine?: string;
      };
      // Accuracy-first: keep optimized local marks; enrich entities from the engine when useful.
      if (remote.facts?.length) {
        const merged: AssetDnaEnvelope = {
          ...local,
          entities:
            remote.entities?.length > local.entities.length
              ? remote.entities
              : local.entities,
          relationships:
            remote.relationships?.length > local.relationships.length
              ? remote.relationships
              : local.relationships,
          timeline: remote.timeline?.length ? remote.timeline : local.timeline,
          summary: `${local.summary} (engine-enriched graph)`.trim(),
        };
        return {
          envelope: merged.projection ? merged : attachProjection(merged, asset.assetClass),
          extractionEngine,
          note: extractionNote,
        };
      }
      return { envelope: local, extractionEngine, note: extractionNote };
    } catch {
      return {
        envelope: { ...local, summary: `${local.summary} (local intelligence fallback)` },
        extractionEngine,
        note: extractionNote,
      };
    }
  }

  private async anchorSourceDocuments(
    organizationId: string,
    assetId: string,
    documents: PipelineDocument[],
    anchoredAt: string,
  ): Promise<ProvenanceAnchorRecord[]> {
    const anchors: ProvenanceAnchorRecord[] = [];
    for (const document of documents) {
      const hashValue = sha256(
        canonicalStringify({
          id: document.id,
          name: document.name,
          type: document.type,
          extractedText: document.extractedText ?? '',
        }),
      );
      const existing = this.db.snapshot.provenanceAnchors.find(
        (item) =>
          item.organizationId === organizationId &&
          item.kind === 'DOCUMENT' &&
          item.documentId === document.id &&
          item.hashValue === hashValue,
      );
      if (existing) {
        continue;
      }
      const anchored = await this.sepolia.anchorProvenanceHash({
        scopeId: `document:${document.id}`,
        hashValue,
      });
      anchors.push({
        id: createId('anc'),
        organizationId,
        assetId,
        documentId: document.id,
        kind: 'DOCUMENT',
        hashAlgorithm: 'sha256',
        hashValue,
        status: anchored.status,
        chainId: anchored.chainId,
        chainName: anchored.chainName,
        txHash: anchored.txHash,
        explorerUrl: anchored.explorerUrl,
        mode: anchored.mode,
        anchoredAt,
        metadata: {
          sourceName: document.name,
          sourceType: document.type,
        },
      });
    }
    return anchors;
  }

  private async anchorSnapshot(
    organizationId: string,
    assetId: string,
    snapshotId: string,
    hashValue: string,
    anchoredAt: string,
  ): Promise<ProvenanceAnchorRecord> {
    const anchored = await this.sepolia.anchorProvenanceHash({
      scopeId: `dna:${snapshotId}`,
      hashValue,
    });
    return {
      id: createId('anc'),
      organizationId,
      assetId,
      dnaSnapshotId: snapshotId,
      kind: 'DNA_SNAPSHOT',
      hashAlgorithm: 'sha256',
      hashValue,
      status: anchored.status,
      chainId: anchored.chainId,
      chainName: anchored.chainName,
      txHash: anchored.txHash,
      explorerUrl: anchored.explorerUrl,
      mode: anchored.mode,
      anchoredAt,
      metadata: {
        scope: 'asset-dna',
      },
    };
  }

  private toTrustedSnapshot(
    organizationId: string,
    snapshotId: string,
  ): TrustedAssetDnaSnapshot {
    const snapshot = this.db.snapshot.dnaSnapshots.find(
      (item) => item.id === snapshotId,
    );
    if (!snapshot) {
      throw new NotFoundException('DNA snapshot not found');
    }
    const anchors = this.db.snapshot.provenanceAnchors.filter(
      (item) =>
        item.organizationId === organizationId &&
        item.assetId === snapshot.assetId,
    );
    const snapshotAnchor = anchors.find(
      (item) =>
        item.kind === 'DNA_SNAPSHOT' && item.dnaSnapshotId === snapshot.id,
    );
    const documentAnchors = snapshot.envelope.sourceDocumentIds
      .map(
        (documentId) =>
          anchors
            .filter(
              (item) =>
                item.kind === 'DOCUMENT' && item.documentId === documentId,
            )
            .sort((a, b) => b.anchoredAt.localeCompare(a.anchoredAt))[0],
      )
      .filter((item): item is ProvenanceAnchor => Boolean(item));
    const verificationState =
      snapshotAnchor &&
      documentAnchors.length === snapshot.envelope.sourceDocumentIds.length
        ? 'VERIFIED'
        : snapshotAnchor || documentAnchors.length
          ? 'PARTIAL'
          : 'PENDING';
    return {
      id: snapshot.id,
      assetId: snapshot.assetId,
      version: snapshot.version,
      createdAt: snapshot.createdAt,
      envelope: snapshot.envelope,
      contentHash: snapshot.contentHash,
      hashAlgorithm: snapshot.hashAlgorithm,
      trust: {
        snapshotAnchor,
        documentAnchors,
        anchoredDocumentCount: documentAnchors.length,
        verificationState,
      },
    };
  }
}

function createSynthesisBriefing(answer: string, note?: string) {
  const parts = answer
    .split(/^\s*#{1,3}\s+/m)
    .map((part) => part.trim())
    .filter(Boolean);
  const sections = parts.length > 1
    ? parts.map((part) => {
        const [title = '', ...body] = part.split('\n');
        const content = body.join('\n').trim();
        return {
          title: title.replace(/[\*_]/g, '') || 'Response',
          body: content || title,
          kind: /^key findings$/i.test(title) ? ('list' as const) : /^evidence|caveats/i.test(title) ? ('note' as const) : ('detail' as const),
        };
      })
    : [{ title: 'Answer', body: answer.trim(), kind: 'detail' as const }];
  const answerSection =
    sections.find((section) => /^answer$/i.test(section.title)) ??
    sections[0] ??
    { title: 'Answer', body: 'No response returned.', kind: 'detail' as const };
  return {
    title: 'Model synthesis',
    headline: answerSection?.body.split(/[\n.!?]/)[0]?.trim() || 'Response prepared from the current Asset DNA context.',
    sections: [
      ...sections,
      ...(note ? [{ title: 'Service note', body: note, kind: 'note' as const }] : []),
    ],
    disclaimer: 'Remote-model synthesis over Asset DNA context. Verify material conclusions against source documents.',
  };
}

function applyOwnershipRegister(
  envelope: AssetDnaEnvelope,
  ownerships: AssetOwnershipRecord[],
): AssetDnaEnvelope {
  if (!ownerships.length) return envelope;
  const observedAt = new Date().toISOString();
  const registeredFacts = (['LEGAL', 'BENEFICIAL', 'ECONOMIC'] as const)
    .map((type) => {
      const holders = ownerships.filter((item) => item.type === type);
      if (!holders.length) return null;
      return {
        id: createId('fact'),
        key: type === 'LEGAL' ? 'legal_ownership' : type.toLowerCase() + '_ownership',
        label: type.charAt(0) + type.slice(1).toLowerCase() + ' ownership',
        value: holders.map((item) => item.holderName + ' (' + item.percentage + '%)').join('; '),
        confidence: 1,
        provenance: [{
          sourceDocumentId: 'ownership-register',
          sourceFragment: 'CAPROV ownership register: ' + holders.map((item) => item.holderName + ' ' + item.percentage + '%').join('; '),
          confidence: 1,
          observedAt,
        }],
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const keys = new Set(registeredFacts.map((fact) => fact.key));
  const facts = [...envelope.facts.filter((fact) => !keys.has(fact.key)), ...registeredFacts];
  const summary = envelope.summary + ' Ownership register synced (' + ownerships.length + ' holder' + (ownerships.length === 1 ? '' : 's') + ', 100% allocated).';
  return { ...envelope, facts, summary };
}

function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([a], [b]) => a.localeCompare(b),
  );
  return `{${entries
    .map(
      ([key, entryValue]) =>
        `${JSON.stringify(key)}:${canonicalStringify(entryValue)}`,
    )
    .join(',')}}`;
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
