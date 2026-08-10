export type {
  AutomationGeneration,
  CanonicalAutomation,
  CanonicalDeleteSemantics,
  CanonicalLifecycleStatus,
} from "./types";
export { PRODUCT_AUTOMATION_NOUN_JA } from "./types";
export {
  CANONICAL_STATUS_LABEL,
  DELETE_CONFIRM_MESSAGE_JA,
  DELETE_SEMANTICS_HINT_JA,
  formatCanonicalStatus,
} from "./status";
export {
  extractV1ShadowId,
  toCanonicalFromV1,
  toCanonicalFromV2,
} from "./normalize";
export {
  mergeCanonicalAutomations,
  resolveAutomationIdTarget,
} from "./merge";
