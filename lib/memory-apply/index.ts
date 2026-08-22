export { MEMORY_APPLY_FEATURE_EVALUATION } from "./feature-evaluation";
export * from "./types";
export {
  compareMemoryQuality,
  expectedTokensFromMemoryValues,
} from "./quality-diff";
export {
  buildContentOverlay,
  buildDeliverableOverlay,
  applyContentOverlayToText,
  applyContentOverlayToDeliverableBody,
} from "./overlays";
export {
  recordMemoryApplyEvent,
  recordMemoryUpdateEvent,
  getMemoryApplyMetrics,
  listMemoryApplyEvents,
  resetMemoryApplyMetricsForTests,
} from "./metrics";
export {
  auditMemoryApplyCoverage,
  MEMORY_APPLY_REQUIRED_CHANNELS,
} from "./audit";
export {
  readPersonalMemoryFromMetadata,
  readPersonalMemoryTokenEstimate,
  buildPersonalMemoryMetadata,
} from "./orchestration-metadata";
export {
  applyMemoryForAutomation,
  recordAutomationMemoryFailure,
  recordAutomationMemorySuccess,
} from "./automation";
export {
  createVisionStyleMemoryCandidates,
  resolveVisionMemoryContext,
} from "./vision";
export {
  applyOcrCorrections,
  resolveOcrMemoryDictionary,
  correctOcrTextWithMemory,
  saveOcrCorrectionToMemory,
} from "./ocr";
export { resolveNotificationPreferencesWithMemory } from "./notifications";
export { resolveSchedulerMemoryDefaults } from "./scheduler";
export { applyMemoryForRegenerate } from "./regenerate";
export { applyMemoryForDeliverable } from "./deliverables";
export {
  applyMemoryToStepBody,
  overlayChatDestinationBody,
  type StepBodyMemoryApply,
} from "./step-body";
export { applyPublishedBodyOverlay } from "./published-body";
export {
  ingestCorrectionInsightsToPersonalMemory,
  correctionInsightsToPreferenceText,
} from "./correction-preferences";
export {
  measureMemoryApplyDelta,
  stripKnownPreferencesFromInstruction,
  detectInstructionPreferenceItems,
  parseExplicitOverrideFromText,
  buildPreferenceAppliedNotice,
  preferenceApplicationRate,
  savedPreferenceKeysFromValues,
} from "./instruction-reduction";
export {
  detectWritingPreferenceStructure,
  applyWritingPreferenceStructure,
  applyHeadingCount,
  buildExplicitWritingPreferenceValue,
} from "./preference-structure";
export { applyContentOverlayToDeliverableBody } from "./overlays";
export {
  detectMemoryChannel,
  channelFromStepType,
  resolveMemoryArtifactTypes,
  type MemoryArtifactChannel,
} from "./channels";

/** Unified secretary Memory API */
export { MemoryProvider } from "./provider";
export type { MemoryProviderRequest, MemoryProviderResult } from "./provider";
export {
  buildPersonalizationContext,
  type PersonalizationContext,
} from "./personalization-context";
export {
  MemoryApply,
  MemoryApplyComparison,
  type MemoryApplyInput,
  type MemoryApplyOutput,
} from "./apply";
export {
  PromptBuilder,
  PromptInjection,
  ContextBuilder,
  type BuiltPrompt,
  type PromptInjectionBlock,
  type SurfaceContextBundle,
} from "./prompt-builder";
export {
  appendMemoryApplyLog,
  listMemoryApplyLogs,
  hydrateMemoryApplyLog,
  resetMemoryApplyLogForTests,
  buildMemoryOnOffComparison,
  MEMORY_APPLY_LOG_DOMAIN_KEY,
  type MemoryApplyLogEntry,
} from "./apply-log";
export { applyMemoryForPrediction } from "./prediction";
export {
  applyMemoryToAutomationCreate,
  snapshotFromAutomation,
  appliedPreferenceLabelsFromAutomation,
} from "./automation-create-apply";
export {
  buildAutomationMemorySnapshot,
  readAutomationMemorySnapshot,
  describeAppliedPreferencesForUser,
  snapshotToDiagnostics,
  approvalFromPreference,
  EMPTY_AUTOMATION_MEMORY_SNAPSHOT,
} from "./automation-memory-snapshot";
export type {
  AutomationMemorySnapshot,
  AutomationMemoryDiagnostics,
} from "./automation-memory-snapshot";
export {
  parseXSocialPreferenceFromText,
  mergeXSocialPreference,
  xSocialPreferenceFromResolved,
  describeXSocialPreference,
  memoryRowAppliesToX,
  EMPTY_X_SOCIAL_PREFERENCE,
  X_MEMORY_ALLOWED_SCOPES,
  X_MEMORY_DENIED_SCOPES,
  MEMORY_APPLY_EXTRA_LLM_CALLS,
} from "./x-social-preference";
export type { XSocialPreference } from "./x-social-preference";
