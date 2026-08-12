/**
 * Safe Production diagnostics for /api/automations/tick failures.
 * Never expose connection strings, secrets, or raw Error.message.
 *
 * Implementation lives in failure-class.ts (shared with /api/worker/drain).
 */

export {
  classifyTickFailure,
  classifyWorkQueueFailure,
  isRetryableWorkQueueFailure,
  tagWorkQueueError,
  type TickDeveloperCode,
  type TickFailureDiagnostics,
  type WorkQueueDeveloperCode,
  type WorkQueueFailureClass,
  type WorkQueueFailureDiagnostics,
} from "./failure-class";
