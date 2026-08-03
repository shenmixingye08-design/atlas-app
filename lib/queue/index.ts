export {
  JOB_PIPELINE_STAGES,
  JOB_EXCEPTION_STAGES,
  canTransitionJobStage,
  transitionJobStage,
  IllegalJobTransitionError,
  appendStatusHistory,
  progressPercentForStage,
  labelForJobStage,
  normalizeJobStage,
  isTerminalJobStage,
  isInProgressJobStage,
} from "./state-machine";
export type {
  JobPipelineStage,
  JobStatusHistoryEntry,
} from "./state-machine";

export {
  computeBackoffWithJitter,
  appendBackoffRecord,
  IMMEDIATE_BACKOFF_BASE_MS,
  SCHEDULED_BACKOFF_BASE_MS,
  DEFAULT_MAX_RETRY_ATTEMPTS,
} from "./backoff";
export type { BackoffRecord } from "./backoff";

export {
  admitJobToQueue,
  DEFAULT_MAX_QUEUED_PER_USER,
  DEFAULT_MAX_IN_FLIGHT_PER_USER,
  DEFAULT_GLOBAL_IN_FLIGHT_SOFT_LIMIT,
} from "./overflow";
export type { QueueDepthSnapshot, QueueAdmitDecision } from "./overflow";

export {
  decideLeaseClaim,
  newWorkerId,
  DEFAULT_LEASE_STALE_MS,
} from "./claim";
export type { LeaseClaimResult } from "./claim";

export { createJobAuditTrail, mergeJobAudit } from "./audit";
export type { JobAuditTrail } from "./audit";

export { JOB_QUEUE_PRODUCTION_FEATURE_EVALUATION } from "./feature-evaluation";
