import { buildDiagnosticId } from "./occurrence";
import type { WorkJobRecord } from "./types";

export type WorkJobDiagnostics = {
  automationId: string | null;
  occurrenceId: string | null;
  runId: string | null;
  jobId: string;
  diagnosticId: string;
  scheduledFor: string | null;
  claimedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  workerId: string | null;
  lease: { owner: string | null; expiresAt: string | null };
  heartbeat: string | null;
  retryCount: number;
  retryReason: string | null;
  provider: string | null;
  externalActionId: string | null;
  failedStage: string | null;
  developerCode: string | null;
};

const SECRET_KEY =
  /secret|token|password|authorization|cookie|api[_-]?key|bearer|private[_-]?key|credential/i;

function safeProvider(job: WorkJobRecord): string | null {
  const assignment = job.payload.assignment ?? "";
  if (/xへ|xに|tweet|twitter/i.test(assignment)) return "x";
  if (/gmail|メール/i.test(assignment)) return "gmail";
  if (/calendar|カレンダー/i.test(assignment)) return "google_calendar";
  if (/dropbox/i.test(assignment)) return "dropbox";
  if (/wordpress|wp/i.test(assignment)) return "wordpress";
  return job.payload.kind ?? null;
}

function firstExternalActionId(job: WorkJobRecord): string | null {
  for (const step of job.steps) {
    const out = step.outputBindings ?? {};
    for (const key of [
      "tweetId",
      "providerResourceId",
      "externalActionId",
      "messageId",
      "eventId",
      "workflowRunId",
    ]) {
      const value = out[key];
      if (typeof value === "string" && value.trim() && !SECRET_KEY.test(key)) {
        return value.slice(0, 128);
      }
    }
  }
  return null;
}

/** Structured job diagnostics — never includes secrets or raw tokens. */
export function buildWorkJobDiagnostics(
  job: WorkJobRecord,
  extra?: {
    workerId?: string | null;
    retryReason?: string | null;
    developerCode?: string | null;
    failedStage?: string | null;
  },
): WorkJobDiagnostics {
  return {
    automationId: job.automationId,
    occurrenceId: job.occurrenceKey,
    runId: job.runId,
    jobId: job.jobId,
    diagnosticId: job.diagnosticId ?? buildDiagnosticId("job"),
    scheduledFor: job.scheduledAt,
    claimedAt: job.claimedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    workerId: extra?.workerId ?? job.leaseOwner,
    lease: {
      owner: job.leaseOwner,
      expiresAt: job.leaseExpiresAt,
    },
    heartbeat: job.heartbeatAt,
    retryCount: job.attempt,
    retryReason: extra?.retryReason ?? job.errorCode,
    provider: safeProvider(job),
    externalActionId: firstExternalActionId(job),
    failedStage: extra?.failedStage ?? job.failedStage,
    developerCode: extra?.developerCode ?? job.errorCode,
  };
}

export function diagnosticsToLogExtra(
  diag: WorkJobDiagnostics,
): Record<string, string | number | boolean | null> {
  return {
    automationId: diag.automationId,
    occurrenceId: diag.occurrenceId,
    runId: diag.runId,
    diagnosticId: diag.diagnosticId,
    scheduledFor: diag.scheduledFor,
    claimedAt: diag.claimedAt,
    startedAt: diag.startedAt,
    completedAt: diag.completedAt,
    workerId: diag.workerId,
    leaseOwner: diag.lease.owner,
    leaseExpiresAt: diag.lease.expiresAt,
    heartbeat: diag.heartbeat,
    retryCount: diag.retryCount,
    retryReason: diag.retryReason,
    provider: diag.provider,
    externalActionId: diag.externalActionId,
    failedStage: diag.failedStage,
    developerCode: diag.developerCode,
  };
}
