import "server-only";

import { randomUUID } from "crypto";

import {
  applyContentPersonalization,
  applyFileNamePattern,
  buildArtifactGeneratorOptions,
} from "@/lib/personalization/apply-artifact";
import {
  buildPersonalizationContext,
  toPlannerPersonalizationPayload,
} from "@/lib/personalization/context-builder";
import {
  ensureProductionMemoryHydrated,
  schedulePersistProductionMemory,
} from "@/lib/personalization/durable";
import { computeQualityMetrics } from "@/lib/personalization/metrics";
import {
  buildPredictionFromMemories,
  markPredictionOutcome,
} from "@/lib/personalization/prediction";
import {
  bumpEvidence,
  createCandidateMemory,
  disableMemory,
  evaluatePromotion,
  promoteCandidate,
  rejectCandidate,
  rollbackMemoryVersion,
  softDeleteMemory,
} from "@/lib/personalization/promotion";
import {
  appendGenerationRecord,
  appendPredictionRecord,
  findProductionMemory,
  isSessionMemoryDisabled,
  listGenerationRecords,
  listPredictionRecords,
  listProductionMemories,
  setSessionMemoryDisabled,
  upsertProductionMemory,
} from "@/lib/personalization/store";
import type {
  ArtifactGeneratorOptions,
  GenerationApplicationRecord,
  PersonalizationContext,
  ProductionMemoryRecord,
  QualityMetrics,
} from "@/lib/personalization/types";

export type ResolvePersonalizationInput = {
  ownerId: string;
  explicitOverrides?: Record<string, unknown> | null;
  automationId?: string | null;
  templateId?: string | null;
  companyId?: string | null;
  category?: string | null;
  artifactType?: string | null;
  skipMemoryIds?: readonly string[] | null;
  memoryEnabled?: boolean;
  /** Evaluation / A-B mode — never auto-run dual generation for prod users */
  evaluationMode?: boolean;
};

export async function resolvePersonalization(
  input: ResolvePersonalizationInput,
): Promise<{
  context: PersonalizationContext;
  plannerPayload: Record<string, unknown>;
  generatorOptions: ArtifactGeneratorOptions;
  predictionId: string | null;
}> {
  await ensureProductionMemoryHydrated(input.ownerId);

  const sessionOff = isSessionMemoryDisabled(input.ownerId);
  const memoryEnabled =
    input.memoryEnabled !== false && !sessionOff;

  const memories = listProductionMemories(input.ownerId);
  const context = buildPersonalizationContext({
    ownerId: input.ownerId,
    memories,
    explicitOverrides: input.explicitOverrides,
    automationId: input.automationId,
    templateId: input.templateId,
    companyId: input.companyId,
    category: input.category,
    artifactType: input.artifactType,
    skipMemoryIds: input.skipMemoryIds,
    memoryEnabled,
  });

  let predictionId: string | null = null;
  if (memoryEnabled) {
    const prediction = buildPredictionFromMemories({
      ownerId: input.ownerId,
      memories,
      category: input.category,
      artifactType: input.artifactType,
    });
    if (prediction) {
      const marked = markPredictionOutcome(prediction, {
        applied: context.appliedMemoryIds.length > 0,
      });
      appendPredictionRecord(marked);
      predictionId = marked.predictionId;
      schedulePersistProductionMemory(input.ownerId);
    }
  }

  return {
    context,
    plannerPayload: toPlannerPersonalizationPayload(context),
    generatorOptions: buildArtifactGeneratorOptions(context),
    predictionId,
  };
}

export function personalizeContentAndFileName(input: {
  content: string;
  baseFileName: string;
  context: PersonalizationContext;
  category?: string;
}): { content: string; baseFileName: string } {
  return {
    content: applyContentPersonalization(input.content, input.context),
    baseFileName: applyFileNamePattern(
      input.baseFileName,
      input.context.deliveryPreferences.fileNamePattern,
      { category: input.category },
    ),
  };
}

export async function recordGenerationApplication(
  input: Omit<GenerationApplicationRecord, "generationId" | "createdAt"> & {
    generationId?: string;
  },
): Promise<GenerationApplicationRecord> {
  await ensureProductionMemoryHydrated(input.ownerId);
  const record: GenerationApplicationRecord = {
    ...input,
    generationId: input.generationId ?? randomUUID(),
    createdAt: new Date().toISOString(),
  };
  appendGenerationRecord(record);

  for (const memoryId of record.appliedMemoryIds) {
    const existing = findProductionMemory(input.ownerId, memoryId);
    if (!existing) continue;
    upsertProductionMemory({
      ...existing,
      appliedCount: existing.appliedCount + 1,
      successfulApplicationCount:
        record.firstAccept === true || (record.postRevisionScore ?? 0) >= 0.7
          ? existing.successfulApplicationCount + 1
          : existing.successfulApplicationCount,
      lastAppliedAt: record.createdAt,
      updatedAt: record.createdAt,
    });
  }

  schedulePersistProductionMemory(input.ownerId);
  return record;
}

export async function recordCorrectionSignal(input: {
  ownerId: string;
  key: string;
  value: Record<string, unknown>;
  title: string;
  summary: string;
  scopeType: ProductionMemoryRecord["scopeType"];
  scopeId?: string | null;
  category?: string | null;
  artifactType?: string | null;
  explicit?: boolean;
}): Promise<{
  memory: ProductionMemoryRecord;
  promoted: boolean;
  status: ProductionMemoryRecord["candidateStatus"];
}> {
  await ensureProductionMemoryHydrated(input.ownerId);
  const existing = listProductionMemories(input.ownerId).find(
    (m) =>
      m.ownerId === input.ownerId &&
      m.key === input.key &&
      m.scopeType === input.scopeType &&
      (m.scopeId ?? null) === (input.scopeId ?? null) &&
      m.candidateStatus !== "deleted",
  );

  let memory: ProductionMemoryRecord;
  if (existing) {
    memory = bumpEvidence(existing, 1);
    memory = {
      ...memory,
      normalizedValue: input.value,
      summary: input.summary.slice(0, 240),
      title: input.title.slice(0, 120),
      confidence: input.explicit
        ? Math.max(memory.confidence, 0.85)
        : memory.confidence,
      category: input.category ?? memory.category,
      artifactType: input.artifactType ?? memory.artifactType,
    };
  } else {
    memory = createCandidateMemory({
      ownerId: input.ownerId,
      key: input.key,
      normalizedValue: input.value,
      title: input.title,
      summary: input.summary,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      category: input.category,
      artifactType: input.artifactType,
      confidence: input.explicit ? 0.85 : 0.55,
      evidenceCount: 1,
    });
  }

  let promoted = false;
  const evaluation = evaluatePromotion(memory);
  if (
    evaluation.canPromote ||
    (evaluation.reasons.length === 1 &&
      evaluation.reasons[0] === "high_impact_needs_approval" &&
      input.explicit &&
      !memory.highImpact)
  ) {
    try {
      memory = promoteCandidate(memory, { approved: Boolean(input.explicit) });
      promoted = true;
    } catch {
      // stay candidate
    }
  } else if (
    memory.evidenceCount >= 3 &&
    memory.confidence >= 0.8 &&
    !memory.highImpact &&
    memory.rejectedCount === 0
  ) {
    try {
      memory = promoteCandidate(memory);
      promoted = true;
    } catch {
      // stay candidate
    }
  }

  upsertProductionMemory(memory);
  schedulePersistProductionMemory(input.ownerId);
  return { memory, promoted, status: memory.candidateStatus };
}

export async function listOwnerMemories(ownerId: string) {
  await ensureProductionMemoryHydrated(ownerId);
  return listProductionMemories(ownerId);
}

export async function listOwnerGenerations(ownerId: string) {
  await ensureProductionMemoryHydrated(ownerId);
  return listGenerationRecords(ownerId);
}

export async function listOwnerPredictions(ownerId: string) {
  await ensureProductionMemoryHydrated(ownerId);
  return listPredictionRecords(ownerId);
}

export async function getOwnerQualityMetrics(
  ownerId: string,
): Promise<QualityMetrics> {
  await ensureProductionMemoryHydrated(ownerId);
  return computeQualityMetrics(listGenerationRecords(ownerId));
}

export async function approveMemory(
  ownerId: string,
  memoryId: string,
): Promise<ProductionMemoryRecord> {
  await ensureProductionMemoryHydrated(ownerId);
  const existing = findProductionMemory(ownerId, memoryId);
  if (!existing || existing.ownerId !== ownerId) {
    throw new Error("MEMORY_NOT_FOUND");
  }
  const approved = {
    ...existing,
    approvedAt: new Date().toISOString(),
    confidence: Math.max(existing.confidence, 0.8),
  };
  const next =
    approved.candidateStatus === "candidate"
      ? promoteCandidate(approved, { approved: true })
      : approved;
  upsertProductionMemory(next);
  schedulePersistProductionMemory(ownerId);
  return next;
}

export async function rejectMemory(
  ownerId: string,
  memoryId: string,
): Promise<ProductionMemoryRecord> {
  await ensureProductionMemoryHydrated(ownerId);
  const existing = findProductionMemory(ownerId, memoryId);
  if (!existing || existing.ownerId !== ownerId) {
    throw new Error("MEMORY_NOT_FOUND");
  }
  const next = rejectCandidate(existing);
  upsertProductionMemory(next);
  schedulePersistProductionMemory(ownerId);
  return next;
}

export async function disableOwnerMemory(
  ownerId: string,
  memoryId: string,
): Promise<ProductionMemoryRecord> {
  await ensureProductionMemoryHydrated(ownerId);
  const existing = findProductionMemory(ownerId, memoryId);
  if (!existing || existing.ownerId !== ownerId) {
    throw new Error("MEMORY_NOT_FOUND");
  }
  const next = disableMemory(existing);
  upsertProductionMemory(next);
  schedulePersistProductionMemory(ownerId);
  return next;
}

export async function deleteOwnerMemory(
  ownerId: string,
  memoryId: string,
): Promise<ProductionMemoryRecord> {
  await ensureProductionMemoryHydrated(ownerId);
  const existing = findProductionMemory(ownerId, memoryId);
  if (!existing || existing.ownerId !== ownerId) {
    throw new Error("MEMORY_NOT_FOUND");
  }
  const next = softDeleteMemory(existing);
  upsertProductionMemory(next);
  schedulePersistProductionMemory(ownerId);
  return next;
}

export async function rollbackOwnerMemory(
  ownerId: string,
  memoryId: string,
  previous: ProductionMemoryRecord,
): Promise<ProductionMemoryRecord> {
  await ensureProductionMemoryHydrated(ownerId);
  const existing = findProductionMemory(ownerId, memoryId);
  if (!existing || existing.ownerId !== ownerId) {
    throw new Error("MEMORY_NOT_FOUND");
  }
  const next = rollbackMemoryVersion(existing, previous);
  upsertProductionMemory(next);
  schedulePersistProductionMemory(ownerId);
  return next;
}

export function setOwnerSessionMemoryDisabled(
  ownerId: string,
  disabled: boolean,
): void {
  setSessionMemoryDisabled(ownerId, disabled);
}

export function exportOwnerMemories(ownerId: string): ProductionMemoryRecord[] {
  return listProductionMemories(ownerId).filter(
    (m) => m.ownerId === ownerId && m.candidateStatus !== "deleted",
  );
}
