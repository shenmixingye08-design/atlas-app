/**
 * Job audit trail fields (request_id, jobId, retries, worker, duration, history).
 */

import type { BackoffRecord } from "@/lib/queue/backoff";
import type {
  JobPipelineStage,
  JobStatusHistoryEntry,
} from "@/lib/queue/state-machine";

export type JobAuditTrail = {
  requestId: string | null;
  jobId: string;
  artifactId: string | null;
  retryCount: number;
  workerId: string | null;
  diagnosticId: string | null;
  durationMs: number | null;
  statusHistory: JobStatusHistoryEntry[];
  backoffRecords: BackoffRecord[];
  lastStage: JobPipelineStage | null;
  notifiedEvents: string[];
};

export function createJobAuditTrail(input: {
  jobId: string;
  requestId?: string | null;
  workerId?: string | null;
  diagnosticId?: string | null;
}): JobAuditTrail {
  return {
    requestId: input.requestId ?? input.jobId,
    jobId: input.jobId,
    artifactId: null,
    retryCount: 0,
    workerId: input.workerId ?? null,
    diagnosticId: input.diagnosticId ?? null,
    durationMs: null,
    statusHistory: [],
    backoffRecords: [],
    lastStage: "queued",
    notifiedEvents: [],
  };
}

export function mergeJobAudit(
  base: JobAuditTrail | undefined,
  patch: Partial<JobAuditTrail>,
): JobAuditTrail {
  const seed =
    base ??
    createJobAuditTrail({
      jobId: patch.jobId ?? "unknown",
      requestId: patch.requestId,
      workerId: patch.workerId,
      diagnosticId: patch.diagnosticId,
    });
  return {
    ...seed,
    ...patch,
    statusHistory: patch.statusHistory ?? seed.statusHistory,
    backoffRecords: patch.backoffRecords ?? seed.backoffRecords,
    notifiedEvents: patch.notifiedEvents ?? seed.notifiedEvents,
  };
}
