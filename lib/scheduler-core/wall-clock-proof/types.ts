/**
 * Phase 2-4 — Scheduler Wall-Clock Proof record types.
 * Measurement / evidence only — not a product feature.
 */

export type WallClockCohort =
  | "normal_time"
  | "same_minute"
  | "timezone"
  | "pause_before"
  | "resume_after"
  | "duplicate_tick"
  | "endpoint_resend"
  | "worker_delay"
  | "queue_delay"
  | "miss_injection"
  | "manual_conflict";

export type WallClockCasePlan = {
  testCaseId: string;
  cohort: WallClockCohort;
  ownerId: string;
  timezone: string;
  priority: number;
  scheduledAt: string;
  /** Expected to be detected/enqueued/leased */
  expectFire: boolean;
  /** Pause schedule before scheduledAt */
  pauseBeforeFire?: boolean;
  /** Pause then resume before scheduledAt */
  resumeBeforeFire?: boolean;
  /** Fire duplicate HTTP ticks after due */
  duplicateTick?: boolean;
  /** Second identical cron request (resend) */
  endpointResend?: boolean;
  /** Delay worker lease (skip drain, lease later) */
  workerDelay?: boolean;
  /** Queue disabled until after due, then retry */
  queueDelay?: boolean;
  /** Inject miss (dispatcher off across due), then recover */
  missInject?: boolean;
  /** Also enqueue a manual run around the same window */
  manualConflict?: boolean;
};

export type WallClockOccurrenceRecord = {
  testCaseId: string;
  scheduleId: string;
  automationId: string;
  occurrenceId: string | null;
  occurrenceKey: string | null;
  scheduledAt: string;
  schedulerDetectedAt: string | null;
  occurrenceCreatedAt: string | null;
  runCreatedAt: string | null;
  jobCreatedAt: string | null;
  outboxCreatedAt: string | null;
  queuedAt: string | null;
  leasedAt: string | null;
  runningAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  scheduleDelayMs: number | null;
  occurrenceCreationMs: number | null;
  enqueueDelayMs: number | null;
  queueWaitMs: number | null;
  leaseWaitMs: number | null;
  startDelayMs: number | null;
  executionDurationMs: number | null;
  retryCount: number;
  duplicateDetected: boolean;
  missedDetected: boolean;
  finalStatus: string;
  diagnosticId: string | null;
  cohort: WallClockCohort;
  timezone: string;
  priority: number;
  expectFire: boolean;
  success: boolean;
  notes: string[];
};

export type WallClockEnvironment = {
  classification:
    | "production"
    | "production_equivalent_preview"
    | "local_formal_path_wall_clock";
  environment: string;
  branch: string;
  commitSha: string;
  vercelProject: string | null;
  previewOrProduction: "preview" | "production" | "local";
  dbEnvironment: string;
  schedulerEndpoint: string;
  cronFrequency: string;
  workerEnvironment: string;
  queueEnvironment: string;
  timezoneHost: string;
  testStartedAt: string;
  testEndedAt: string | null;
  testEndScheduledAt: string | null;
  notes: string[];
};

export type DelaySummary = {
  count: number;
  mean: number | null;
  median: number | null;
  p90: number | null;
  p95: number | null;
  p99: number | null;
  max: number | null;
};

export type WallClockVerdict = "PASS" | "CONDITIONAL_FAIL" | "FAIL";
