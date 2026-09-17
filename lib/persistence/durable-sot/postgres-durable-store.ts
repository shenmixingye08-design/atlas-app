import "server-only";

import type { DurableStore } from "./durable-store";
import {
  createDurableSotPool,
  resolveDurableSotDatabaseUrl,
  type DurableSotPool,
} from "./db";
import { DurableEvidenceRepository } from "./repositories/evidence-repository";
import { DurableHeartbeatsRepository } from "./repositories/heartbeats-repository";
import { DurableIdempotencyRepository } from "./repositories/idempotency-repository";
import { DurableLeasesRepository } from "./repositories/leases-repository";
import { DurableOccurrencesRepository } from "./repositories/occurrences-repository";
import { DurableRecoveryStatesRepository } from "./repositories/recovery-states-repository";
import { DurableRetryStatesRepository } from "./repositories/retry-states-repository";
import { DurableRunsRepository } from "./repositories/runs-repository";
import { DurableStepsRepository } from "./repositories/steps-repository";
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
 * Postgres-backed DurableStore facade.
 * Delegates to repositories only — no business logic / no Queue wiring.
 */
export class PostgresDurableStore implements DurableStore {
  readonly kind = "postgres" as const;

  readonly runs: DurableRunsRepository;
  readonly steps: DurableStepsRepository;
  readonly leases: DurableLeasesRepository;
  readonly heartbeats: DurableHeartbeatsRepository;
  readonly retryStates: DurableRetryStatesRepository;
  readonly recoveryStates: DurableRecoveryStatesRepository;
  readonly occurrences: DurableOccurrencesRepository;
  readonly evidence: DurableEvidenceRepository;
  readonly idempotency: DurableIdempotencyRepository;

  constructor(private readonly pool: DurableSotPool) {
    this.runs = new DurableRunsRepository(pool);
    this.steps = new DurableStepsRepository(pool);
    this.leases = new DurableLeasesRepository(pool);
    this.heartbeats = new DurableHeartbeatsRepository(pool);
    this.retryStates = new DurableRetryStatesRepository(pool);
    this.recoveryStates = new DurableRecoveryStatesRepository(pool);
    this.occurrences = new DurableOccurrencesRepository(pool);
    this.evidence = new DurableEvidenceRepository(pool);
    this.idempotency = new DurableIdempotencyRepository(pool);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  createRun(input: CreateDurableRunInput): Promise<DurableRunRecord> {
    return this.runs.create(input);
  }
  updateRun(
    runId: string,
    patch: UpdateDurableRunInput,
  ): Promise<DurableRunRecord | null> {
    return this.runs.update(runId, patch);
  }
  getRun(runId: string): Promise<DurableRunRecord | null> {
    return this.runs.get(runId);
  }
  findPendingRuns(limit?: number): Promise<DurableRunRecord[]> {
    return this.runs.findPending(limit);
  }
  findRecoverableRuns(input: {
    nowIso: string;
    limit?: number;
  }): Promise<DurableRunRecord[]> {
    return this.runs.findRecoverable(input);
  }

  createStep(input: CreateDurableStepInput): Promise<DurableStepRecord> {
    return this.steps.create(input);
  }
  updateStep(
    runId: string,
    stepId: string,
    patch: Parameters<DurableStore["updateStep"]>[2],
  ): Promise<DurableStepRecord | null> {
    return this.steps.update(runId, stepId, patch);
  }
  listSteps(runId: string): Promise<DurableStepRecord[]> {
    return this.steps.list(runId);
  }

  acquireLease(
    input: AcquireLeaseInput,
  ): Promise<{ lease: DurableLeaseRecord; acquired: boolean }> {
    return this.leases.acquire(input);
  }
  releaseLease(runId: string, leaseOwner: string): Promise<boolean> {
    return this.leases.release(runId, leaseOwner);
  }
  getLease(runId: string): Promise<DurableLeaseRecord | null> {
    return this.leases.get(runId);
  }

  saveHeartbeat(input: SaveHeartbeatInput): Promise<DurableHeartbeatRecord> {
    return this.heartbeats.save(input);
  }
  getHeartbeat(runId: string): Promise<DurableHeartbeatRecord | null> {
    return this.heartbeats.get(runId);
  }

  saveRetry(input: SaveRetryInput): Promise<DurableRetryStateRecord> {
    return this.retryStates.save(input);
  }
  getRetry(runId: string): Promise<DurableRetryStateRecord | null> {
    return this.retryStates.get(runId);
  }

  saveRecovery(input: SaveRecoveryInput): Promise<DurableRecoveryStateRecord> {
    return this.recoveryStates.save(input);
  }
  getRecovery(runId: string): Promise<DurableRecoveryStateRecord | null> {
    return this.recoveryStates.get(runId);
  }

  createOccurrence(
    input: CreateDurableOccurrenceInput,
  ): Promise<DurableOccurrenceRecord> {
    return this.occurrences.create(input);
  }
  findOccurrence(input: {
    automationId: string;
    occurrenceKey: string;
  }): Promise<DurableOccurrenceRecord | null> {
    return this.occurrences.find(input);
  }
  getOccurrence(
    occurrenceId: string,
  ): Promise<DurableOccurrenceRecord | null> {
    return this.occurrences.get(occurrenceId);
  }

  appendEvidence(input: AppendEvidenceInput): Promise<DurableEvidenceRecord> {
    return this.evidence.append(input);
  }
  listEvidence(runId: string): Promise<DurableEvidenceRecord[]> {
    return this.evidence.list(runId);
  }

  async recordCompletion(input: {
    runId: string;
    status: "succeeded" | "failed" | "cancelled" | "dead_letter";
    resultSummary?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    completedAt?: string;
  }): Promise<DurableRunRecord | null> {
    return this.runs.update(input.runId, {
      status: input.status,
      resultSummary: input.resultSummary ?? null,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
      completedAt: input.completedAt ?? new Date().toISOString(),
    });
  }

  recordIdempotency(
    input: RecordIdempotencyInput,
  ): Promise<{ record: DurableIdempotencyRecord; created: boolean }> {
    return this.idempotency.record(input);
  }
  findIdempotency(input: {
    scope: string;
    idempotencyKey: string;
  }): Promise<DurableIdempotencyRecord | null> {
    return this.idempotency.find(input);
  }
}

/** Factory — returns null when no DB URL (callers must not invent memory SoT). */
export function tryCreatePostgresDurableStore(): PostgresDurableStore | null {
  const url = resolveDurableSotDatabaseUrl();
  if (!url) return null;
  return new PostgresDurableStore(createDurableSotPool(url));
}
