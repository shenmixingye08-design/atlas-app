export { AUTOMATION_PLATFORM_FEATURE_EVALUATION } from "./feature-evaluation";
export {
  INTERNAL_DOMAIN,
  USER_FACING_NAME_CANDIDATES,
  RECOMMENDED_USER_FACING_LABEL,
  LEGACY_V1_IDENTIFIERS,
} from "./terminology";

export * from "./types";
export {
  CAPABILITY_REGISTRY,
  getCapability,
  requireCapability,
  isKnownCapabilityId,
  listHighRiskCapabilities,
  stepRequiresSystemApproval,
} from "./step-registry/registry";
export {
  computeNextRunFromSchedule,
  computeNextRunIsoFromTrigger,
  validateScheduleSpec,
  assertNotPastOneShot,
} from "./schedule/compute";
export {
  DEFAULT_AUTOMATION_PLATFORM_TIMEZONE,
  isValidTimeZone,
  resolveTimeZone,
} from "./schedule/timezone";
export {
  canTransitionDefinitionStatus,
  canTransitionRunStatus,
  assertDefinitionTransition,
  assertRunTransition,
  createStatusTransition,
} from "./state-machine/transitions";
export {
  buildScheduleOccurrenceKey,
  buildRunKey,
  buildIdempotencyKey,
} from "./idempotency/keys";
export {
  detectInstructionConflicts,
  resolveInstruction,
} from "./instruction/conflict";
export {
  validateMemoryPolicy,
  resolveReadableMemoryScopes,
  applyMemoryWithOverrides,
} from "./memory/contract";
export {
  normalizeExecutionPolicy,
  resolveRunApprovalRequirement,
} from "./execution/policy";
export { migrateV1Automations, convertV1ToV2 } from "./migration/v1-to-v2";
export { automationPlatformService } from "./service/automation-service";
export { AutomationPlatformError } from "./errors/messages";
export type { AutomationErrorCode } from "./errors/codes";
