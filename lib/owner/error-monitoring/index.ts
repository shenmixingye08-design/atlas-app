export type {
  ErrorCategoryId,
  ErrorCategorySnapshot,
  ErrorMonitoringSnapshot,
  ErrorResolutionStatus,
} from "./types";

export { ERROR_CATEGORY_DEFINITIONS } from "./registry";
export { recordOwnerError } from "./store";
export { buildErrorMonitoringSnapshot } from "./service";

export {
  isOpenAiRelatedError,
  recordGoogleAuthFailure,
  recordOpenAiFailure,
  recordOpenAiFailureIfApplicable,
  recordStripeFailure,
  recordWebhookFailure,
  recordXPostFailure,
  recordXAuthFailure,
} from "./telemetry";
