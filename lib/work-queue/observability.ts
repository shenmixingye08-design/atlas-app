export type WorkQueueLogEvent =
  | "SCHEDULE_TICK_STARTED"
  | "OCCURRENCE_CREATED"
  | "JOB_ENQUEUED"
  | "JOB_LEASED"
  | "JOB_STARTED"
  | "HEARTBEAT"
  | "STEP_STARTED"
  | "STEP_COMPLETED"
  | "STEP_FAILED"
  | "RETRY_SCHEDULED"
  | "JOB_RECOVERED"
  | "JOB_COMPLETED"
  | "JOB_FAILED"
  | "JOB_CANCELLED"
  | "DUPLICATE_OCCURRENCE"
  | "OCCURRENCE_SKIPPED"
  | "OCCURRENCE_DELAYED"
  | "OCCURRENCE_MISSED"
  | "STUCK_DETECTED";

export type WorkQueueLogFields = {
  event: WorkQueueLogEvent;
  automationId?: string | null;
  occurrenceKey?: string | null;
  runId?: string | null;
  jobId?: string | null;
  stepId?: string | null;
  ownerId?: string | null;
  attempt?: number;
  durationMs?: number;
  diagnosticId?: string | null;
  errorCode?: string | null;
  extra?: Record<string, string | number | boolean | null | undefined>;
};

function maskOwner(ownerId: string | null | undefined): string | null {
  if (!ownerId) return null;
  if (ownerId.length <= 8) return "***";
  return `${ownerId.slice(0, 4)}…${ownerId.slice(-4)}`;
}

/** Structured logs — no secrets, owner masked. */
export function logWorkQueue(fields: WorkQueueLogFields): void {
  const line = {
    ts: new Date().toISOString(),
    scope: "work-queue",
    event: fields.event,
    automationId: fields.automationId ?? null,
    occurrenceKey: fields.occurrenceKey ?? null,
    runId: fields.runId ?? null,
    jobId: fields.jobId ?? null,
    stepId: fields.stepId ?? null,
    ownerId: maskOwner(fields.ownerId),
    attempt: fields.attempt ?? null,
    durationMs: fields.durationMs ?? null,
    diagnosticId: fields.diagnosticId ?? null,
    errorCode: fields.errorCode ?? null,
    ...fields.extra,
  };
  // Keep Vitest output readable; production/CI still emit structured lines.
  if (process.env.VITEST === "true") return;
  process.stdout.write(`${JSON.stringify(line)}\n`);
}
