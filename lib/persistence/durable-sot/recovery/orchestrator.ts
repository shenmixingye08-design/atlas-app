/**
 * Durable recovery orchestration via repositories only.
 * Does not re-run completed steps; does not change completion-gate rules.
 */

import type { DurableSotPool } from "../db";
import { resolveStuckThresholdMs } from "../lease-config";
import { DurableEvidenceRepository } from "../repositories/evidence-repository";
import { DurableHeartbeatsRepository } from "../repositories/heartbeats-repository";
import { DurableIdempotencyRepository } from "../repositories/idempotency-repository";
import { DurableJobRecoveriesRepository } from "../repositories/job-recoveries-repository";
import { DurableJobsRepository } from "../repositories/jobs-repository";
import { DurableLeaseMetricsRepository } from "../repositories/lease-metrics-repository";
import { DurableLeasesRepository } from "../repositories/leases-repository";
import { DurableQueueRepository } from "../repositories/queue-repository";
import { DurableStepsRepository } from "../repositories/steps-repository";
import type { DurableJobRecord, DurableJobRecoveryRecord } from "../types";
import { assessRecoveryEligibility } from "./assess";

export type RecoverStuckResult = {
  examined: number;
  recovered: number;
  manualReview: number;
  failed: number;
  records: DurableJobRecoveryRecord[];
};

export class DurableRecoveryOrchestrator {
  private readonly queue: DurableQueueRepository;
  private readonly jobs: DurableJobsRepository;
  private readonly steps: DurableStepsRepository;
  private readonly recoveries: DurableJobRecoveriesRepository;
  private readonly evidence: DurableEvidenceRepository;
  private readonly idempotency: DurableIdempotencyRepository;
  private readonly leases: DurableLeasesRepository;
  private readonly heartbeats: DurableHeartbeatsRepository;
  private readonly metrics: DurableLeaseMetricsRepository;

  constructor(private readonly pool: DurableSotPool) {
    this.queue = new DurableQueueRepository(pool);
    this.jobs = new DurableJobsRepository(pool);
    this.steps = new DurableStepsRepository(pool);
    this.recoveries = new DurableJobRecoveriesRepository(pool);
    this.evidence = new DurableEvidenceRepository(pool);
    this.idempotency = new DurableIdempotencyRepository(pool);
    this.leases = new DurableLeasesRepository(pool);
    this.heartbeats = new DurableHeartbeatsRepository(pool);
    this.metrics = new DurableLeaseMetricsRepository(pool);
  }

  async detectStuck(nowMs = Date.now()): Promise<DurableJobRecord[]> {
    const stuckMs = resolveStuckThresholdMs();
    const cutoffIso = new Date(nowMs - stuckMs).toISOString();
    const nowIso = new Date(nowMs).toISOString();
    return this.queue.listStuck({ cutoffIso, nowIso, limit: 100 });
  }

  async recoverStuck(input?: {
    nowMs?: number;
    recoveryWorkerId?: string;
  }): Promise<RecoverStuckResult> {
    const nowMs = input?.nowMs ?? Date.now();
    const workerId = input?.recoveryWorkerId ?? "recovery_worker";
    const stuck = await this.detectStuck(nowMs);
    const records: DurableJobRecoveryRecord[] = [];
    let recovered = 0;
    let manualReview = 0;
    let failed = 0;

    for (const job of stuck) {
      await this.metrics.increment("stuckJobCount");
      await this.metrics.increment("recoveryAttemptCount");
      const started = Date.now();

      const detected = await this.recoveries.create({
        jobId: job.jobId,
        runId: job.runId,
        detectedReason:
          job.leaseExpiresAt && new Date(job.leaseExpiresAt).getTime() < nowMs
            ? "lease_expired"
            : "heartbeat_timeout",
        previousLeaseOwner: job.leaseOwner,
        previousLeaseToken: job.leaseToken,
        recoveryWorkerId: workerId,
        recoveryStatus: "assessing",
        diagnosticId: job.diagnosticId,
      });

      const steps = await this.steps.listByJobId(job.jobId);
      const evidenceList = await this.evidence.list(job.runId);
      const idem = await this.idempotency.find({
        scope: "job",
        idempotencyKey: job.idempotencyKey,
      });

      const assessment = assessRecoveryEligibility({
        job,
        steps: steps.length ? steps : await this.steps.list(job.runId),
        hasCompletionEvidence: evidenceList.length > 0,
        hasIdempotencyRecord: Boolean(idem),
        detectedReason: detected.detectedReason,
      });

      await this.recoveries.update(detected.recoveryId, {
        recoveryStatus: "assessing",
        recoveryFromStepId: assessment.fromStepId,
        recoveryStrategy: assessment.strategy,
        assessment: {
          recoverable: assessment.recoverable,
          reason: assessment.reason,
          sideEffects: assessment.sideEffects,
        },
      });

      if (!assessment.recoverable) {
        const status =
          assessment.strategy === "manual_review" ? "manual_review" : "failed";
        const terminalJobStatus =
          status === "manual_review" ? "failed" : "dead_letter";
        await this.jobs.update(job.jobId, {
          status: terminalJobStatus,
          leaseOwner: null,
          leaseExpiresAt: null,
          leaseToken: null,
          completedAt: new Date(nowMs).toISOString(),
          errorCode: assessment.reason,
          lastError: `recovery_${status}`,
        });
        const updated = await this.recoveries.update(detected.recoveryId, {
          recoveryStatus: status,
          failedAt: new Date(nowMs).toISOString(),
          errorCode: assessment.reason,
        });
        if (updated) records.push(updated);
        await this.metrics.increment("recoveryFailureCount");
        if (status === "manual_review") manualReview += 1;
        else failed += 1;
        await this.metrics.recordRecoveryDurationMs(Date.now() - started);
        continue;
      }

      await this.recoveries.update(detected.recoveryId, {
        recoveryStatus: "recovering",
        recoveryFromStepId: assessment.fromStepId,
        recoveryStrategy: "resume_from_step",
      });

      // Persist recovery-capable requeue — completed steps remain completed.
      // Clear lease so a new worker can claim; do not mark completed.
      await this.jobs.update(job.jobId, {
        status: "retry",
        availableAt: new Date(nowMs).toISOString(),
        leaseOwner: null,
        leaseExpiresAt: null,
        leaseToken: null,
        workerInstanceId: null,
        errorCode: "stuck_recovered",
        lastError: `resume_from:${assessment.fromStepId ?? "next_pending"}`,
      });

      // Soft-release durable lease row if present.
      if (job.runId) {
        try {
          await this.leases.release(job.runId, job.leaseOwner ?? "");
        } catch {
          /* ignore */
        }
      }

      const done = await this.recoveries.update(detected.recoveryId, {
        recoveryStatus: "recovered",
        recoveredAt: new Date().toISOString(),
        recoveryFromStepId: assessment.fromStepId,
      });
      if (done) records.push(done);
      await this.metrics.increment("recoverySuccessCount");
      await this.metrics.recordRecoveryDurationMs(Date.now() - started);
      recovered += 1;
    }

    return {
      examined: stuck.length,
      recovered,
      manualReview,
      failed,
      records,
    };
  }

  async metricsSnapshot(nowMs = Date.now()) {
    const nowIso = new Date(nowMs).toISOString();
    const stuckMs = resolveStuckThresholdMs();
    const cutoffIso = new Date(nowMs - stuckMs).toISOString();
    return this.metrics.snapshot({
      activeLeases: await this.queue.countActiveLeases(nowIso),
      expiredLeases: await this.queue.countExpiredLeases(nowIso),
      stuckJobCount: await this.queue.countStuck(cutoffIso, nowIso),
    });
  }

  getQueue(): DurableQueueRepository {
    return this.queue;
  }

  getHeartbeats(): DurableHeartbeatsRepository {
    return this.heartbeats;
  }

  getRecoveries(): DurableJobRecoveriesRepository {
    return this.recoveries;
  }

  getMetrics(): DurableLeaseMetricsRepository {
    return this.metrics;
  }
}
