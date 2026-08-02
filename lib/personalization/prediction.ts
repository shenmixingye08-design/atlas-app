import { randomUUID } from "crypto";

import type {
  PredictionRecord,
  PredictionType,
  ProductionMemoryRecord,
} from "@/lib/personalization/types";

/** User-facing copy — never label pure rules as「AI予測」. */
export const USER_FACING_PREDICTION_LABEL = "過去の利用から提案";

export function classifyPredictionType(input: {
  hasStatisticalModel: boolean;
  usedLlm: boolean;
  ruleMatched: boolean;
  heuristicScore?: number;
}): PredictionType {
  if (input.usedLlm) return "llm_inference";
  if (input.hasStatisticalModel) return "statistical_prediction";
  if (input.ruleMatched && (input.heuristicScore ?? 0) < 0.5) {
    return "deterministic_rule";
  }
  return "heuristic";
}

export function buildPredictionFromMemories(input: {
  ownerId: string;
  memories: ProductionMemoryRecord[];
  category?: string | null;
  artifactType?: string | null;
}): PredictionRecord | null {
  const relevant = input.memories.filter(
    (m) =>
      m.ownerId === input.ownerId &&
      m.candidateStatus === "active" &&
      m.deletedAt == null &&
      m.disabledAt == null &&
      (input.category == null ||
        m.category == null ||
        m.category === input.category) &&
      (input.artifactType == null ||
        m.artifactType == null ||
        m.artifactType === input.artifactType),
  );
  if (relevant.length === 0) return null;

  const top = [...relevant].sort(
    (a, b) => b.appliedCount - a.appliedCount || b.confidence - a.confidence,
  )[0]!;

  const predictionType = classifyPredictionType({
    hasStatisticalModel: false,
    usedLlm: false,
    ruleMatched: top.evidenceCount >= 3,
    heuristicScore: top.confidence,
  });

  return {
    predictionId: randomUUID(),
    ownerId: input.ownerId,
    sourceSignals: [
      `memory:${top.memoryId}`,
      `scope:${top.scopeType}`,
      `key:${top.key}`,
      `evidence:${top.evidenceCount}`,
    ],
    predictionType,
    userFacingLabel: USER_FACING_PREDICTION_LABEL,
    confidence: top.confidence,
    applied: false,
    accepted: null,
    rejected: null,
    corrected: null,
    outcome: null,
    createdAt: new Date().toISOString(),
  };
}

export function markPredictionOutcome(
  prediction: PredictionRecord,
  outcome: {
    applied?: boolean;
    accepted?: boolean;
    rejected?: boolean;
    corrected?: boolean;
    outcome?: string;
  },
): PredictionRecord {
  return {
    ...prediction,
    applied: outcome.applied ?? prediction.applied,
    accepted: outcome.accepted ?? prediction.accepted,
    rejected: outcome.rejected ?? prediction.rejected,
    corrected: outcome.corrected ?? prediction.corrected,
    outcome: outcome.outcome ?? prediction.outcome,
  };
}
