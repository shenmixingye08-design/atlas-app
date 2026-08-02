export type {
  ConnectionStatus,
  IntegrationServiceId,
  ExecuteResult,
  IntegrationServiceMetrics,
} from "@/lib/integration-platform/types";
export { CONNECTION_STATUSES, INTEGRATION_SERVICE_IDS } from "@/lib/integration-platform/types";
export { catalogAudit } from "@/lib/integration-platform/connection-manager";
export {
  evaluateIntegrationCompletionGate,
  requiredServicesForAutomation,
} from "@/lib/integration-platform/completion-gate";
export {
  executeWithRetryPolicy,
  isRetryable,
  classifyError,
} from "@/lib/integration-platform/retry-policy";
export { runIntegrationBenchmark100 } from "@/lib/integration-platform/benchmark";
export {
  verifyUploadRoundTrip,
  uploadVerificationOk,
} from "@/lib/integration-platform/upload-verify";
export {
  verifyWordPressPost,
  verifyXPost,
  postVerificationOk,
} from "@/lib/integration-platform/post-verify";
