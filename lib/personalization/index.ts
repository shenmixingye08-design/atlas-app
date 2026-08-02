export type {
  PersonalizationContext,
  ProductionMemoryRecord,
  GenerationApplicationRecord,
  QualityMetrics,
  PredictionRecord,
  LearningLoopResult,
  ArtifactGeneratorOptions,
} from "@/lib/personalization/types";

export { buildPersonalizationContext } from "@/lib/personalization/context-builder";
export { resolveMemoryPriority } from "@/lib/personalization/priority";
export {
  applyContentPersonalization,
  buildArtifactGeneratorOptions,
  applyOcrPersonalization,
  applyVisionSummaryPersonalization,
} from "@/lib/personalization/apply-artifact";
export {
  computeDiffMetrics,
  preferenceMatchScore,
} from "@/lib/personalization/structural-diff";
export { computeQualityMetrics } from "@/lib/personalization/metrics";
export {
  USER_FACING_PREDICTION_LABEL,
  classifyPredictionType,
} from "@/lib/personalization/prediction";
export {
  PROMOTION_MIN_EVIDENCE,
  PROMOTION_MIN_CONFIDENCE,
  evaluatePromotion,
  createCandidateMemory,
  promoteCandidate,
} from "@/lib/personalization/promotion";
export {
  buildPersonalizationMetadata,
  formatPersonalizationForPlanner,
} from "@/lib/personalization/metadata";
