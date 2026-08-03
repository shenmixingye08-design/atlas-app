export type SchedulerCoreLogEvent =
  | "SCHEDULER_REQUEST_RECEIVED"
  | "SCHEDULER_AUTH_FAILED"
  | "SCHEDULER_TICK_STARTED"
  | "DUE_SCHEDULES_LOADED"
  | "OCCURRENCE_CREATED"
  | "OCCURRENCE_DUPLICATE_SKIPPED"
  | "RUN_CREATED"
  | "JOB_CREATED"
  | "OUTBOX_CREATED"
  | "NEXT_RUN_UPDATED"
  | "MISFIRE_SKIPPED"
  | "SCHEDULER_TICK_COMPLETED"
  | "SCHEDULER_TICK_FAILED";

export type SchedulerCoreLogFields = {
  event: SchedulerCoreLogEvent;
  schedulerTickId?: string | null;
  requestId?: string | null;
  scheduleId?: string | null;
  automationId?: string | null;
  occurrenceId?: string | null;
  runId?: string | null;
  jobId?: string | null;
  durationMs?: number | null;
  status?: string | null;
  errorCode?: string | null;
  diagnosticId?: string | null;
  extra?: Record<string, string | number | boolean | null | undefined>;
};

/** Structured logs — never log secrets or raw PII. */
export function logSchedulerCore(fields: SchedulerCoreLogFields): void {
  if (process.env.VITEST === "true" && process.env.SCHEDULER_CORE_LOG !== "true") {
    return;
  }
  const line = {
    ts: new Date().toISOString(),
    scope: "scheduler-core",
    event: fields.event,
    schedulerTickId: fields.schedulerTickId ?? null,
    requestId: fields.requestId ?? null,
    scheduleId: fields.scheduleId ?? null,
    automationId: fields.automationId ?? null,
    occurrenceId: fields.occurrenceId ?? null,
    runId: fields.runId ?? null,
    jobId: fields.jobId ?? null,
    durationMs: fields.durationMs ?? null,
    status: fields.status ?? null,
    errorCode: fields.errorCode ?? null,
    diagnosticId: fields.diagnosticId ?? null,
    ...fields.extra,
  };
  process.stdout.write(`${JSON.stringify(line)}\n`);
}
