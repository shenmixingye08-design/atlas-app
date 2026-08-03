/**
 * Scheduler Core Unification (Phase 2-2) — shared types.
 */

export type SchedulerEnvironment = "production" | "preview" | "development" | "test";

export type MisfirePolicy = "run_once_immediately" | "skip_missed" | "catch_up_limited";

export type SchedulerTickStatus =
  | "succeeded"
  | "partial"
  | "failed"
  | "skipped"
  | "unauthorized"
  | "misconfigured";

export type SchedulerRecurrence =
  | { frequency: "once"; runAt: string }
  | { frequency: "daily"; hour: number; minute: number }
  | { frequency: "weekly"; hour: number; minute: number; daysOfWeek: number[] }
  | { frequency: "monthly"; hour: number; minute: number; dayOfMonth: number }
  | { frequency: "month_end"; hour: number; minute: number }
  | { frequency: "weekdays"; hour: number; minute: number }
  | { frequency: "custom_days"; hour: number; minute: number; daysOfWeek: number[] };

export type CalculateNextRunAtInput = {
  recurrence: SchedulerRecurrence;
  timezone: string;
  from?: Date;
  startAt?: string | null;
  endAt?: string | null;
};

export type DueScheduleRow = {
  automationId: string;
  ownerId: string;
  name: string;
  nextRunAt: string;
  timezone: string;
  enabled: boolean;
  paused: boolean;
  deleted: boolean;
  endAt?: string | null;
  misfirePolicy: MisfirePolicy;
  /** V1 schedule blob for nextRun recalculation */
  scheduleKind: "v1";
  v1Schedule: import("@/lib/automations/types").AutomationSchedule;
};

export type SchedulerOutboxStatus =
  | "pending"
  | "processing"
  | "delivered"
  | "failed"
  | "dead";

export type SchedulerOutboxRow = {
  outboxId: string;
  tickId: string;
  occurrenceKey: string;
  automationId: string;
  ownerId: string;
  runId: string;
  jobId: string;
  scheduledAt: string;
  payload: Record<string, unknown>;
  status: SchedulerOutboxStatus;
  availableAt: string;
  attempt: number;
  dispatchedAt: string | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SchedulerTickHistory = {
  schedulerTickId: string;
  requestId: string;
  environment: SchedulerEnvironment;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  dueCount: number;
  occurrenceCreatedCount: number;
  duplicateSkippedCount: number;
  invalidScheduleCount: number;
  failedCount: number;
  outboxCreatedCount: number;
  nextRunUpdatedCount: number;
  misfireSkippedCount: number;
  status: SchedulerTickStatus;
  errorCode: string | null;
  diagnosticId: string;
};

export type SchedulerOccurrenceLink = {
  tickId: string;
  occurrenceKey: string;
  automationId: string;
  ownerId: string;
  runId: string;
  jobId: string;
  scheduledAt: string;
  created: boolean;
  misfirePolicy: MisfirePolicy;
  misfireAction: "enqueue" | "skip_missed" | "catch_up" | "duplicate_skip";
  reason: string | null;
};

export type SchedulerCoreTickResult = {
  requestStatus: "ok" | "error";
  schedulerStatus: SchedulerTickStatus;
  tickId: string;
  requestId: string;
  diagnosticId: string;
  environment: SchedulerEnvironment;
  dueCount: number;
  occurrenceCreatedCount: number;
  duplicateSkippedCount: number;
  failedCount: number;
  outboxCreatedCount: number;
  nextRunUpdatedCount: number;
  misfireSkippedCount: number;
  worker?: {
    completed: number;
    failed: number;
    leased: number;
  };
  errorCode?: string | null;
  message?: string;
};

export const FORMAL_SCHEDULER_TICK_PATH = "/api/internal/scheduler/tick";
export const FORMAL_SCHEDULER_HEALTH_PATH = "/api/internal/scheduler/health";
export const DEPRECATED_AUTOMATIONS_TICK_PATH = "/api/automations/tick";

/** Compat window for CRON_SECRET → SCHEDULER_CRON_SECRET. Remove after 2026-10-01. */
export const SCHEDULER_SECRET_COMPAT_UNTIL = "2026-10-01";
export const DEFAULT_MISFIRE_POLICY: MisfirePolicy = "run_once_immediately";
export const CATCH_UP_LIMIT = 1;
