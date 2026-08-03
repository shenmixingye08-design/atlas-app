import type {
  DurableEvidenceRecord,
  DurableHeartbeatRecord,
  DurableIdempotencyRecord,
  DurableJobRecord,
  DurableLeaseRecord,
  DurableOccurrenceRecord,
  DurableRecoveryStateRecord,
  DurableRetryStateRecord,
  DurableRunRecord,
  DurableRunStatus,
  DurableStepRecord,
  DurableStepStatus,
  DurableOccurrenceStatus,
  DurableRecoveryStatus,
} from "./types";

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function isoOrNull(value: unknown): string | null {
  if (value == null) return null;
  return iso(value);
}

export function mapRun(row: Record<string, unknown>): DurableRunRecord {
  return {
    runId: String(row.run_id),
    ownerId: String(row.owner_id),
    automationId: (row.automation_id as string | null) ?? null,
    jobId: row.job_id == null ? null : String(row.job_id),
    occurrenceId: row.occurrence_id == null ? null : String(row.occurrence_id),
    status: row.status as DurableRunStatus,
    triggerType: String(row.trigger_type ?? "manual"),
    payload: (row.payload as Record<string, unknown>) ?? {},
    resultSummary: (row.result_summary as string | null) ?? null,
    errorCode: (row.error_code as string | null) ?? null,
    errorMessage: (row.error_message as string | null) ?? null,
    idempotencyKey: (row.idempotency_key as string | null) ?? null,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    startedAt: isoOrNull(row.started_at),
    completedAt: isoOrNull(row.completed_at),
    expiresAt: isoOrNull(row.expires_at),
  };
}

export function mapJob(row: Record<string, unknown>): DurableJobRecord {
  return {
    jobId: String(row.job_id),
    runId: String(row.run_id),
    ownerId: String(row.owner_id),
    automationId: (row.automation_id as string | null) ?? null,
    occurrenceId: row.occurrence_id == null ? null : String(row.occurrence_id),
    occurrenceKey: String(row.occurrence_key),
    scheduleId: (row.schedule_id as string | null) ?? null,
    status: row.status as DurableJobRecord["status"],
    priority: Number(row.priority ?? 0),
    availableAt: iso(row.available_at),
    scheduledAt: isoOrNull(row.scheduled_at),
    startedAt: isoOrNull(row.started_at),
    completedAt: isoOrNull(row.completed_at),
    leaseOwner: (row.lease_owner as string | null) ?? null,
    leaseExpiresAt: isoOrNull(row.lease_expires_at),
    heartbeatAt: isoOrNull(row.heartbeat_at),
    attempt: Number(row.attempt ?? 0),
    maxAttempts: Number(row.max_attempts ?? 5),
    retryAt: isoOrNull(row.retry_at),
    errorCode: (row.error_code as string | null) ?? null,
    errorMessage: (row.error_message as string | null) ?? null,
    diagnosticId: (row.diagnostic_id as string | null) ?? null,
    failedStage: (row.failed_stage as string | null) ?? null,
    firstError: (row.first_error as string | null) ?? null,
    lastError: (row.last_error as string | null) ?? null,
    idempotencyKey: String(row.idempotency_key),
    payload: (row.payload as Record<string, unknown>) ?? {},
    resultSummary: (row.result_summary as string | null) ?? null,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    expiresAt: isoOrNull(row.expires_at),
  };
}

export function mapStep(row: Record<string, unknown>): DurableStepRecord {
  return {
    runId: String(row.run_id),
    stepId: String(row.step_id),
    jobId: row.job_id == null ? null : String(row.job_id),
    stepIndex: Number(row.step_index),
    stepType: String(row.step_type),
    status: row.status as DurableStepStatus,
    attempt: Number(row.attempt ?? 0),
    inputBindings: (row.input_bindings as Record<string, unknown>) ?? {},
    outputBindings: (row.output_bindings as Record<string, unknown>) ?? {},
    errorCode: (row.error_code as string | null) ?? null,
    errorMessage: (row.error_message as string | null) ?? null,
    startedAt: isoOrNull(row.started_at),
    completedAt: isoOrNull(row.completed_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export function mapLease(row: Record<string, unknown>): DurableLeaseRecord {
  return {
    runId: String(row.run_id),
    jobId: row.job_id == null ? null : String(row.job_id),
    leaseOwner: String(row.lease_owner),
    leaseExpiresAt: iso(row.lease_expires_at),
    acquiredAt: iso(row.acquired_at),
    updatedAt: iso(row.updated_at),
    createdAt: iso(row.created_at),
  };
}

export function mapHeartbeat(
  row: Record<string, unknown>,
): DurableHeartbeatRecord {
  return {
    runId: String(row.run_id),
    jobId: row.job_id == null ? null : String(row.job_id),
    leaseOwner: String(row.lease_owner),
    heartbeatAt: iso(row.heartbeat_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export function mapRetry(
  row: Record<string, unknown>,
): DurableRetryStateRecord {
  return {
    runId: String(row.run_id),
    jobId: row.job_id == null ? null : String(row.job_id),
    attempt: Number(row.attempt ?? 0),
    maxAttempts: Number(row.max_attempts ?? 5),
    retryAt: isoOrNull(row.retry_at),
    errorCode: (row.error_code as string | null) ?? null,
    errorMessage: (row.error_message as string | null) ?? null,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export function mapRecovery(
  row: Record<string, unknown>,
): DurableRecoveryStateRecord {
  return {
    runId: String(row.run_id),
    jobId: row.job_id == null ? null : String(row.job_id),
    recoveryStatus: row.recovery_status as DurableRecoveryStatus,
    reason: (row.reason as string | null) ?? null,
    lastRecoveryAt: isoOrNull(row.last_recovery_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export function mapOccurrence(
  row: Record<string, unknown>,
): DurableOccurrenceRecord {
  return {
    occurrenceId: String(row.occurrence_id),
    ownerId: String(row.owner_id),
    automationId: String(row.automation_id),
    occurrenceKey: String(row.occurrence_key),
    scheduleId: (row.schedule_id as string | null) ?? null,
    scheduledAt: iso(row.scheduled_at),
    status: row.status as DurableOccurrenceStatus,
    runId: row.run_id == null ? null : String(row.run_id),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    expiresAt: isoOrNull(row.expires_at),
  };
}

export function mapEvidence(
  row: Record<string, unknown>,
): DurableEvidenceRecord {
  return {
    evidenceId: String(row.evidence_id),
    runId: String(row.run_id),
    jobId: row.job_id == null ? null : String(row.job_id),
    evidenceKind: String(row.evidence_kind),
    evidenceFingerprint: String(row.evidence_fingerprint),
    payload: (row.payload as Record<string, unknown>) ?? {},
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export function mapIdempotency(
  row: Record<string, unknown>,
): DurableIdempotencyRecord {
  return {
    scope: String(row.scope),
    idempotencyKey: String(row.idempotency_key),
    runId: row.run_id == null ? null : String(row.run_id),
    jobId: row.job_id == null ? null : String(row.job_id),
    payload: (row.payload as Record<string, unknown>) ?? {},
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    expiresAt: isoOrNull(row.expires_at),
  };
}
