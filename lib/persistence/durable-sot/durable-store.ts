import type {
  AppendEvidenceInput,
  AcquireLeaseInput,
  CreateDurableOccurrenceInput,
  CreateDurableRunInput,
  CreateDurableStepInput,
  DurableEvidenceRecord,
  DurableHeartbeatRecord,
  DurableIdempotencyRecord,
  DurableLeaseRecord,
  DurableOccurrenceRecord,
  DurableRecoveryStateRecord,
  DurableRetryStateRecord,
  DurableRunRecord,
  DurableStepRecord,
  RecordIdempotencyInput,
  SaveHeartbeatInput,
  SaveRecoveryInput,
  SaveRetryInput,
  UpdateDurableRunInput,
} from "./types";

/**
 * Durable SoT store contract (Phase 1-2).
 * Interface only for callers — implementations are Repository-backed Postgres.
 * Not connected to Queue/Worker/Automation in this phase.
 */
export type DurableStore = {
  readonly kind: "postgres";

  createRun(input: CreateDurableRunInput): Promise<DurableRunRecord>;
  updateRun(
    runId: string,
    patch: UpdateDurableRunInput,
  ): Promise<DurableRunRecord | null>;
  getRun(runId: string): Promise<DurableRunRecord | null>;
  findPendingRuns(limit?: number): Promise<DurableRunRecord[]>;
  findRecoverableRuns(input: {
    nowIso: string;
    limit?: number;
  }): Promise<DurableRunRecord[]>;

  createStep(input: CreateDurableStepInput): Promise<DurableStepRecord>;
  updateStep(
    runId: string,
    stepId: string,
    patch: Partial<
      Pick<
        DurableStepRecord,
        | "status"
        | "attempt"
        | "outputBindings"
        | "errorCode"
        | "errorMessage"
        | "startedAt"
        | "completedAt"
        | "jobId"
      >
    >,
  ): Promise<DurableStepRecord | null>;
  listSteps(runId: string): Promise<DurableStepRecord[]>;

  acquireLease(
    input: AcquireLeaseInput,
  ): Promise<{ lease: DurableLeaseRecord; acquired: boolean }>;
  releaseLease(runId: string, leaseOwner: string): Promise<boolean>;
  getLease(runId: string): Promise<DurableLeaseRecord | null>;

  saveHeartbeat(input: SaveHeartbeatInput): Promise<DurableHeartbeatRecord>;
  getHeartbeat(runId: string): Promise<DurableHeartbeatRecord | null>;

  saveRetry(input: SaveRetryInput): Promise<DurableRetryStateRecord>;
  getRetry(runId: string): Promise<DurableRetryStateRecord | null>;

  saveRecovery(input: SaveRecoveryInput): Promise<DurableRecoveryStateRecord>;
  getRecovery(runId: string): Promise<DurableRecoveryStateRecord | null>;

  createOccurrence(
    input: CreateDurableOccurrenceInput,
  ): Promise<DurableOccurrenceRecord>;
  findOccurrence(input: {
    automationId: string;
    occurrenceKey: string;
  }): Promise<DurableOccurrenceRecord | null>;
  getOccurrence(occurrenceId: string): Promise<DurableOccurrenceRecord | null>;

  appendEvidence(input: AppendEvidenceInput): Promise<DurableEvidenceRecord>;
  listEvidence(runId: string): Promise<DurableEvidenceRecord[]>;
  recordCompletion(input: {
    runId: string;
    status: "succeeded" | "failed" | "cancelled" | "dead_letter";
    resultSummary?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    completedAt?: string;
  }): Promise<DurableRunRecord | null>;

  recordIdempotency(
    input: RecordIdempotencyInput,
  ): Promise<{ record: DurableIdempotencyRecord; created: boolean }>;
  findIdempotency(input: {
    scope: string;
    idempotencyKey: string;
  }): Promise<DurableIdempotencyRecord | null>;
};
