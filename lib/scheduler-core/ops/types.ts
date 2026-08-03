/**
 * Phase 2-5 — Scheduler Production Cutover ops types.
 */

export type SchedulerOpsHealth = {
  running: boolean;
  healthy: boolean;
  status: "ok" | "warn" | "down" | "misconfigured";
  lastTickAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  dueCount: number | null;
  queueCount: number | null;
  oldestDueAgeMs: number | null;
  p95DelayMs: number | null;
  retryCount: number | null;
  recoverySuccessRate: number | null;
  outboxPendingCount: number | null;
  workerCount: number | null;
  diagnosticId: string;
};

export type SchedulerOpsMetrics = {
  tickCount: number | null;
  runCount: number | null;
  occurrenceCount: number | null;
  queueCount: number;
  missCount: number | null;
  duplicateCount: number;
  retryCount: number;
  recoveryCount: number | null;
  recoverySuccessRate: number | null;
  p50DelayMs: number | null;
  p90DelayMs: number | null;
  p95DelayMs: number | null;
  p99DelayMs: number | null;
  averageDelayMs: number | null;
};

export type SchedulerOpsAlertCode =
  | "scheduler_stopped"
  | "scheduler_stale"
  | "due_backlog"
  | "queue_backlog"
  | "duplicate_detected"
  | "miss_detected"
  | "worker_stopped"
  | "retry_spike"
  | "recovery_failed"
  | "p95_delay_exceeded"
  | "stuck_jobs"
  | "dead_letter"
  | "failure_spike"
  | "success_rate_low"
  | "dispatcher_disabled"
  | "queue_disabled";

export type SchedulerOpsAlert = {
  code: SchedulerOpsAlertCode;
  severity: "warning" | "critical";
  message: string;
};

export type SchedulerOpsKillSwitches = {
  scheduledCronEnabled: boolean;
  dispatcherDisabled: boolean;
  queueDisabled: boolean;
  previewTickAllowed: boolean;
  schedulerSecretConfigured: boolean;
};

export type SchedulerOpsSnapshot = {
  phase: "2-5";
  generatedAt: string;
  environment: string;
  formalPath: string;
  health: SchedulerOpsHealth;
  metrics: SchedulerOpsMetrics;
  alerts: SchedulerOpsAlert[];
  killSwitches: SchedulerOpsKillSwitches;
  sections: {
    scheduler: true;
    queue: true;
    worker: true;
    automation: true;
    health: true;
  };
};
