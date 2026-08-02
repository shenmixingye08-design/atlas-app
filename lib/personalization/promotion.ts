/**
 * Candidate → active promotion. Never promote on a single correction.
 */

import { randomUUID } from "crypto";

import { HIGH_IMPACT_KEYS } from "@/lib/personalization/types";
import type {
  MemoryScopeType,
  ProductionMemoryRecord,
  ProductionMemorySource,
} from "@/lib/personalization/types";

export const PROMOTION_MIN_EVIDENCE = 3;
export const PROMOTION_MIN_CONFIDENCE = 0.8;

export type PromotionEvaluation = {
  canPromote: boolean;
  reasons: string[];
  requiresUserApproval: boolean;
};

export function isHighImpactKey(key: string): boolean {
  return (HIGH_IMPACT_KEYS as readonly string[]).includes(key);
}

export function evaluatePromotion(
  memory: ProductionMemoryRecord,
): PromotionEvaluation {
  const reasons: string[] = [];

  if (memory.candidateStatus !== "candidate") {
    reasons.push("not_candidate");
  }
  if (memory.evidenceCount < PROMOTION_MIN_EVIDENCE) {
    reasons.push(`evidence_below_${PROMOTION_MIN_EVIDENCE}`);
  }
  if (memory.confidence < PROMOTION_MIN_CONFIDENCE) {
    reasons.push(`confidence_below_${PROMOTION_MIN_CONFIDENCE}`);
  }
  if (memory.rejectedCount > 0) {
    reasons.push("has_explicit_rejection");
  }
  if (memory.deletedAt || memory.disabledAt) {
    reasons.push("disabled_or_deleted");
  }

  const requiresUserApproval =
    memory.highImpact || isHighImpactKey(memory.key);

  if (requiresUserApproval && !memory.approvedAt) {
    reasons.push("high_impact_needs_approval");
  }

  return {
    canPromote: reasons.length === 0,
    reasons,
    requiresUserApproval,
  };
}

export function promoteCandidate(
  memory: ProductionMemoryRecord,
  options?: { approved?: boolean },
): ProductionMemoryRecord {
  const evaluation = evaluatePromotion({
    ...memory,
    approvedAt:
      options?.approved || memory.approvedAt
        ? memory.approvedAt ?? new Date().toISOString()
        : null,
  });

  if (!evaluation.canPromote) {
    throw new Error(`PROMOTION_BLOCKED:${evaluation.reasons.join(",")}`);
  }

  const now = new Date().toISOString();
  return {
    ...memory,
    candidateStatus: "active",
    approvedAt:
      memory.highImpact || isHighImpactKey(memory.key)
        ? memory.approvedAt ?? now
        : memory.approvedAt,
    updatedAt: now,
    version: memory.version + 1,
    lastEvaluatedAt: now,
  };
}

export function createCandidateMemory(input: {
  ownerId: string;
  key: string;
  normalizedValue: Record<string, unknown>;
  title: string;
  summary: string;
  scopeType: MemoryScopeType;
  scopeId?: string | null;
  category?: string | null;
  artifactType?: string | null;
  source?: ProductionMemorySource;
  confidence?: number;
  evidenceCount?: number;
  highImpact?: boolean;
}): ProductionMemoryRecord {
  const now = new Date().toISOString();
  const highImpact =
    input.highImpact ?? isHighImpactKey(input.key);
  return {
    memoryId: randomUUID(),
    ownerId: input.ownerId,
    scopeType: input.scopeType,
    scopeId: input.scopeId ?? null,
    category: input.category ?? null,
    artifactType: input.artifactType ?? null,
    key: input.key,
    normalizedValue: input.normalizedValue,
    source: input.source ?? "user_correction",
    candidateStatus: "candidate",
    confidence: Math.min(1, Math.max(0.1, input.confidence ?? 0.55)),
    evidenceCount: input.evidenceCount ?? 1,
    acceptedCount: 0,
    rejectedCount: 0,
    appliedCount: 0,
    successfulApplicationCount: 0,
    createdAt: now,
    updatedAt: now,
    disabledAt: null,
    deletedAt: null,
    version: 1,
    lastAppliedAt: null,
    lastEvaluatedAt: now,
    title: input.title.slice(0, 120),
    summary: input.summary.slice(0, 240),
    highImpact,
    approvedAt: null,
  };
}

export function bumpEvidence(
  memory: ProductionMemoryRecord,
  delta = 1,
): ProductionMemoryRecord {
  const evidenceCount = memory.evidenceCount + delta;
  const confidence = Math.min(
    0.95,
    memory.confidence + delta * 0.1,
  );
  return {
    ...memory,
    evidenceCount,
    confidence,
    updatedAt: new Date().toISOString(),
    lastEvaluatedAt: new Date().toISOString(),
  };
}

export function rejectCandidate(
  memory: ProductionMemoryRecord,
): ProductionMemoryRecord {
  return {
    ...memory,
    candidateStatus: "rejected",
    rejectedCount: memory.rejectedCount + 1,
    updatedAt: new Date().toISOString(),
    version: memory.version + 1,
  };
}

export function disableMemory(
  memory: ProductionMemoryRecord,
): ProductionMemoryRecord {
  const now = new Date().toISOString();
  return {
    ...memory,
    candidateStatus: "disabled",
    disabledAt: now,
    updatedAt: now,
    version: memory.version + 1,
  };
}

export function softDeleteMemory(
  memory: ProductionMemoryRecord,
): ProductionMemoryRecord {
  const now = new Date().toISOString();
  return {
    ...memory,
    candidateStatus: "deleted",
    deletedAt: now,
    updatedAt: now,
    version: memory.version + 1,
  };
}

export function rollbackMemoryVersion(
  current: ProductionMemoryRecord,
  previous: ProductionMemoryRecord,
): ProductionMemoryRecord {
  if (previous.ownerId !== current.ownerId) {
    throw new Error("OWNER_ISOLATION_VIOLATION");
  }
  if (previous.memoryId !== current.memoryId) {
    throw new Error("MEMORY_ID_MISMATCH");
  }
  return {
    ...previous,
    version: current.version + 1,
    updatedAt: new Date().toISOString(),
  };
}
