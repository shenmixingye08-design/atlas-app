export {
  CONTEXT_TOKEN_BUDGETS,
  PAST_ARTIFACT_CAPS,
  getContextTokenBudget,
  getPastArtifactCap,
} from "./config"
export { scoreKnowledgeCandidate, scoreAllCandidates } from "./scorer"
export { applyContextBudget, sumSelectedTokens } from "./budget"
export { compressKnowledgeEntries, compressPackedText } from "./compressor"
export { resolveContextConflicts } from "./conflict-resolver"
export {
  buildSmartContextCacheKey,
  fingerprintText,
  getSmartContextCache,
  setSmartContextCache,
  invalidateSmartContextCache,
  resetSmartContextCacheForTests,
  listSmartContextCacheKeysForTests,
} from "./cache"
export {
  selectSmartContext,
  toMergedKnowledgePack,
  pickRefillCandidateIds,
  pickRefillIdsFromDecisions,
  isInformationGapFeedback,
  type SelectSmartContextInput,
} from "./selector"
export {
  buildSmartContextTelemetry,
  type SmartContextTelemetry,
} from "./telemetry"
export { getArtifactContextRule } from "./rules"
export type {
  ArtifactContextRule,
  ExclusionReasonCode,
  SelectionReasonCode,
  ScoredKnowledgeCandidate,
  SmartContextSelectionResult,
  SmartContextStats,
  SmartContextCacheKeyInput,
} from "./types"
