export type SchedulerLifecycleStatus =
  | "scheduled"
  | "running"
  | "completed"
  | "failed"
  | "stopped";

export type SchedulerExecutionLogStatus =
  | "scheduled"
  | "running"
  | "completed"
  | "failed";

export type SchedulerScheduleRecord = {
  scheduleId: string;
  automationId: string;
  ownerId: string;
  cronExpression: string;
  timezone: string;
  presetType: string;
  nextRun: string | null;
  lastRun: string | null;
  lastSuccess: string | null;
  lastFailure: string | null;
  retryCount: number;
  executionTime: string | null;
  durationMs: number | null;
  status: SchedulerLifecycleStatus;
  enabled: boolean;
  idempotencyKey: string | null;
  lockOwner: string | null;
  lockExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SchedulerExecutionLog = {
  logId: string;
  scheduleId: string;
  automationId: string;
  ownerId: string;
  jobId: string | null;
  occurrenceKey: string;
  idempotencyKey: string;
  status: SchedulerExecutionLogStatus;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  retryCount: number;
  createdAt: string;
};

export const SCHEDULER_STATUS_TRANSITIONS: Record<
  SchedulerLifecycleStatus,
  readonly SchedulerLifecycleStatus[]
> = {
  scheduled: ["running", "stopped", "failed"],
  running: ["completed", "failed", "scheduled"],
  completed: ["scheduled", "running"],
  failed: ["scheduled", "running", "stopped"],
  stopped: ["scheduled"],
};
