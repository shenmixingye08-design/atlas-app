/**
 * Production Scheduler evidence model.
 * completed は Scheduler 起動証跡がある場合のみ許可（Fail Closed）。
 */

export type SchedulerFailureReason =
  | "timeout"
  | "worker_busy"
  | "queue_full"
  | "storage"
  | "external_api"
  | "permission"
  | "unknown";

export type SchedulerExecutionSource =
  | "v1_tick"
  | "v2_schedule"
  | "manual_tick"
  | "reliability_retry"
  | "proof";

/** One scheduled fire / tick execution evidence row. */
export type SchedulerExecutionRecord = {
  id: string;
  jobId: string;
  runId: string;
  scheduleId: string;
  scheduledAt: string;
  startedAt: string;
  endedAt: string;
  delayMs: number;
  success: boolean;
  failureReason: SchedulerFailureReason | null;
  failureMessage: string | null;
  retryCount: number;
  workerId: string;
  durationMs: number;
  source: SchedulerExecutionSource;
  automationId: string | null;
  createdAt: string;
};

export type SchedulerAliveState = {
  alive: boolean;
  lastTickAt: string | null;
  lastTickOk: boolean | null;
  lastTickError: string | null;
  consecutiveFailures: number;
  tickCount: number;
  stopped: boolean;
};

export type SchedulerMetrics = {
  total: number;
  successes: number;
  failures: number;
  successRate: number | null;
  averageDelayMs: number | null;
  maxDelayMs: number | null;
  p95DelayMs: number | null;
  retryCount: number;
  byFailureReason: Record<SchedulerFailureReason, number>;
  windowMs: number;
  generatedAt: string;
};

export type SchedulerQueueSnapshot = {
  queueSize: number;
  runningJobs: number;
  waitingJobs: number;
  failedJobs: number;
  retryingJobs: number;
};

export type SchedulerHealth = {
  schedulerAlive: boolean;
  schedulerStopped: boolean;
  queueSize: number;
  runningJobs: number;
  waitingJobs: number;
  failedJobs: number;
  averageDelayMs: number | null;
  successRate: number | null;
  retryCount: number;
  lastTickAt: string | null;
  level: "ok" | "warn" | "down";
  detail: string;
  generatedAt: string;
};

export type SchedulerAlertId =
  | "success_rate_low"
  | "scheduler_stopped"
  | "queue_growth";

export type SchedulerAlert = {
  id: SchedulerAlertId;
  severity: "critical" | "warn";
  title: string;
  message: string;
  metric: string;
  value: number | string | null;
  threshold: number | string | null;
  at: string;
};

export type SchedulerProofSummary = {
  runs: number;
  successes: number;
  failures: number;
  successRate: number;
  averageDelayMs: number;
  maxDelayMs: number;
  rows: Array<{
    scheduledAt: string;
    startedAt: string;
    delayMs: number;
    success: boolean;
    failureReason: SchedulerFailureReason | null;
  }>;
  generatedAt: string;
};
