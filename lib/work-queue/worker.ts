import { randomUUID } from "node:crypto";

import {
  WORK_QUEUE_HEARTBEAT_MS,
  WORK_QUEUE_LEASE_MS,
  WORK_QUEUE_MAX_EXECUTION_MS,
  WORK_QUEUE_STUCK_MS,
  WORK_QUEUE_WORKER_BATCH,
} from "./constants";
import { buildDiagnosticId } from "./occurrence";
import { logWorkQueue } from "./observability";
import { evaluateWorkQueueCompletion } from "./completion-gate";
import { decideRetry } from "./retry";
import { getWorkQueueStore } from "./store";
import { executeWorkStep } from "./steps/execute-step";
import type { WorkJobRecord, WorkStepRecord } from "./types";

export type WorkerDrainResult = {
  workerId: string;
  leased: number;
  completed: number;
  failed: number;
  retried: number;
  recovered: number;
  completedJobs: Array<{
    jobId: string;
    runId: string;
    automationId: string | null;
    status: "completed";
  }>;
  failedJobs: Array<{
    jobId: string;
    runId: string;
    automationId: string | null;
    status: "failed" | "dead_letter";
    errorCode: string | null;
  }>;
};

function mergeOutputs(steps: WorkStepRecord[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const step of steps) {
    if (step.status === "completed") {
      Object.assign(out, step.outputBindings);
    }
  }
  return out;
}

const SIDE_EFFECT_STEP_TYPES = new Set([
  "run_automation",
  "notify_complete",
  "upload_storage",
]);

function hasSideEffectEvidence(step: WorkStepRecord): boolean {
  const out = step.outputBindings ?? {};
  return Boolean(
    out.notified === true ||
      out.notificationId ||
      out.workflowRunId ||
      out.notifyReceipt ||
      out.externalApplied === true ||
      (Array.isArray(step.artifactIds) && step.artifactIds.length > 0),
  );
}

async function processLeasedJob(
  job: WorkJobRecord,
  workerId: string,
): Promise<"completed" | "failed" | "retried"> {
  const store = getWorkQueueStore();
  const started = Date.now();

  const running = await store.updateJob(
    job.jobId,
    { status: "running", heartbeatAt: new Date().toISOString() },
    workerId,
  );
  if (!running) return "failed";

  logWorkQueue({
    event: "JOB_STARTED",
    jobId: job.jobId,
    runId: job.runId,
    automationId: job.automationId,
    occurrenceKey: job.occurrenceKey,
    ownerId: job.ownerId,
    attempt: job.attempt,
  });

  const heartbeat = setInterval(() => {
    void store.heartbeat(job.jobId, workerId, WORK_QUEUE_LEASE_MS).then((ok) => {
      if (ok) {
        logWorkQueue({
          event: "HEARTBEAT",
          jobId: job.jobId,
          ownerId: job.ownerId,
        });
      }
    });
  }, WORK_QUEUE_HEARTBEAT_MS);

  try {
    const current = (await store.getJob(job.jobId)) ?? running;
    const previousOutputs = mergeOutputs(current.steps);

    for (const step of [...current.steps].sort(
      (a, b) => a.stepIndex - b.stepIndex,
    )) {
      if (Date.now() - started > WORK_QUEUE_MAX_EXECUTION_MS) {
        const failAt = new Date().toISOString();
        await store.updateJob(
          job.jobId,
          {
            status: "failed",
            completedAt: failAt,
            failedAt: failAt,
            errorCode: "max_execution_exceeded",
            lastError: "max execution time exceeded",
            leaseOwner: null,
            leaseExpiresAt: null,
          },
          workerId,
        );
        return "failed";
      }
      if (step.status === "completed" || step.status === "skipped") {
        Object.assign(previousOutputs, step.outputBindings);
        continue;
      }
      if (step.status === "cancelled") {
        break;
      }

      // P0-06: reclaim of an in-flight side-effect step must not re-execute.
      if (step.status === "running") {
        if (hasSideEffectEvidence(step)) {
          const doneAt = new Date().toISOString();
          const completedStep: WorkStepRecord = {
            ...step,
            status: "completed",
            completedAt: doneAt,
            updatedAt: doneAt,
            outputBindings: {
              ...step.outputBindings,
              externalApplied: true,
              recoveredFromRunning: true,
            },
          };
          await store.updateStep(completedStep);
          Object.assign(previousOutputs, completedStep.outputBindings);
          continue;
        }
        if (SIDE_EFFECT_STEP_TYPES.has(step.stepType)) {
          const failAt = new Date().toISOString();
          const failedStep: WorkStepRecord = {
            ...step,
            status: "failed",
            completedAt: failAt,
            updatedAt: failAt,
            errorCode: "unknown_outcome",
            errorMessage:
              "Ambiguous reclaim of side-effect step — not re-executed",
          };
          await store.updateStep(failedStep);
          const diagnosticId =
            current.diagnosticId ?? buildDiagnosticId("step");
          await store.updateJob(
            job.jobId,
            {
              status: "failed",
              attempt: current.attempt + 1,
              errorCode: "unknown_outcome",
              failedStage: step.stepId,
              diagnosticId,
              firstError: current.firstError ?? failedStep.errorMessage,
              lastError: failedStep.errorMessage,
              completedAt: failAt,
              leaseOwner: null,
              leaseExpiresAt: null,
              resultSummary:
                "Side-effect step was interrupted; not re-run to avoid duplicates",
            },
            workerId,
          );
          logWorkQueue({
            event: "JOB_FAILED",
            jobId: job.jobId,
            stepId: step.stepId,
            ownerId: job.ownerId,
            errorCode: "unknown_outcome",
            diagnosticId,
          });
          return "failed";
        }
        // Non-side-effect running steps may safely retry generate/fixture work.
      }

      const stepStarted = new Date().toISOString();
      const runningStep: WorkStepRecord = {
        ...step,
        status: "running",
        attempt: step.attempt + 1,
        startedAt: step.startedAt ?? stepStarted,
        updatedAt: stepStarted,
      };
      await store.updateStep(runningStep);
      logWorkQueue({
        event: "STEP_STARTED",
        jobId: job.jobId,
        stepId: step.stepId,
        ownerId: job.ownerId,
        attempt: runningStep.attempt,
      });

      const result = await executeWorkStep({
        job: current,
        step: runningStep,
        previousOutputs,
      });

      if (result.ok) {
        const doneAt = new Date().toISOString();
        const completedStep: WorkStepRecord = {
          ...runningStep,
          status: "completed",
          completedAt: doneAt,
          updatedAt: doneAt,
          outputBindings: {
            ...runningStep.outputBindings,
            ...(result.outputBindings ?? {}),
            ...(result.externalApplied ? { externalApplied: true } : {}),
          },
          artifactIds: result.artifactIds ?? runningStep.artifactIds,
          errorCode: null,
          errorMessage: null,
        };
        await store.updateStep(completedStep);
        Object.assign(previousOutputs, completedStep.outputBindings);
        logWorkQueue({
          event: "STEP_COMPLETED",
          jobId: job.jobId,
          stepId: step.stepId,
          ownerId: job.ownerId,
          durationMs: Date.now() - started,
        });
        continue;
      }

      const failAt = new Date().toISOString();
      const failedStep: WorkStepRecord = {
        ...runningStep,
        status: "failed",
        completedAt: failAt,
        updatedAt: failAt,
        errorCode: result.errorCode ?? "external_temporary",
        errorMessage: result.errorMessage ?? "step failed",
      };
      await store.updateStep(failedStep);
      logWorkQueue({
        event: "STEP_FAILED",
        jobId: job.jobId,
        stepId: step.stepId,
        ownerId: job.ownerId,
        errorCode: failedStep.errorCode,
      });

      const attempt = current.attempt + 1;
      const decision = decideRetry({
        errorCode: failedStep.errorCode,
        attempt,
        maxAttempts: current.maxAttempts,
      });
      const diagnosticId =
        current.diagnosticId ?? buildDiagnosticId("step");

      if (decision.retryable && decision.retryAt) {
        await store.updateJob(
          job.jobId,
          {
            status: "retry_scheduled",
            attempt,
            retryAt: decision.retryAt,
            availableAt: decision.retryAt,
            errorCode: failedStep.errorCode,
            failedStage: step.stepId,
            diagnosticId,
            firstError: current.firstError ?? failedStep.errorMessage,
            lastError: failedStep.errorMessage,
            leaseOwner: null,
            leaseExpiresAt: null,
          },
          workerId,
        );
        logWorkQueue({
          event: "RETRY_SCHEDULED",
          jobId: job.jobId,
          stepId: step.stepId,
          ownerId: job.ownerId,
          attempt,
          errorCode: failedStep.errorCode,
          diagnosticId,
        });
        return "retried";
      }

      await store.updateJob(
        job.jobId,
        {
          status: decision.deadLetter ? "dead_letter" : "failed",
          attempt,
          errorCode: failedStep.errorCode,
          failedStage: step.stepId,
          diagnosticId,
          firstError: current.firstError ?? failedStep.errorMessage,
          lastError: failedStep.errorMessage,
          completedAt: failAt,
          leaseOwner: null,
          leaseExpiresAt: null,
          resultSummary: decision.userMessage,
        },
        workerId,
      );
      logWorkQueue({
        event: "JOB_FAILED",
        jobId: job.jobId,
        stepId: step.stepId,
        ownerId: job.ownerId,
        errorCode: failedStep.errorCode,
        diagnosticId,
      });
      return "failed";
    }

    const latest = (await store.getJob(job.jobId)) ?? running;
    const gate = evaluateWorkQueueCompletion(latest);
    const doneAt = new Date().toISOString();
    if (!gate.ok) {
      await store.updateJob(
        job.jobId,
        {
          status: "failed",
          completedAt: doneAt,
          leaseOwner: null,
          leaseExpiresAt: null,
          errorCode: gate.errorCode,
          failedStage: "completion_gate",
          lastError: gate.errorMessage,
          resultSummary: gate.errorMessage,
        },
        workerId,
      );
      logWorkQueue({
        event: "JOB_FAILED",
        jobId: job.jobId,
        ownerId: job.ownerId,
        errorCode: gate.errorCode,
      });
      return "failed";
    }

    await store.updateJob(
      job.jobId,
      {
        status: "completed",
        completedAt: doneAt,
        leaseOwner: null,
        leaseExpiresAt: null,
        resultSummary: gate.summary,
        errorCode: null,
        failedStage: null,
      },
      workerId,
    );
    await store.recordExecutionMs(Date.now() - started);
    logWorkQueue({
      event: "JOB_COMPLETED",
      jobId: job.jobId,
      runId: job.runId,
      automationId: job.automationId,
      occurrenceKey: job.occurrenceKey,
      ownerId: job.ownerId,
      durationMs: Date.now() - started,
    });
    return "completed";
  } finally {
    clearInterval(heartbeat);
  }
}

export async function recoverStuckJobs(
  nowMs = Date.now(),
): Promise<number> {
  const store = getWorkQueueStore();
  const stuck = await store.listStuck(nowMs, WORK_QUEUE_STUCK_MS);
  let recovered = 0;
  for (const job of stuck) {
    logWorkQueue({
      event: "STUCK_DETECTED",
      jobId: job.jobId,
      ownerId: job.ownerId,
      automationId: job.automationId,
    });
    const diagnosticId = job.diagnosticId ?? buildDiagnosticId("stuck");
    const attempt = job.attempt + 1;
    const decision = decideRetry({
      errorCode: "stuck_recovered",
      attempt,
      maxAttempts: job.maxAttempts,
      nowMs,
    });
    const nextStatus =
      decision.retryable && decision.retryAt
        ? ("retry_scheduled" as const)
        : decision.deadLetter
          ? ("dead_letter" as const)
          : ("failed" as const);

    // P0-2: atomic reclaim only — never SELECT-then-UPDATE fallback.
    if (!store.reclaimStuckJob) {
      logWorkQueue({
        event: "STUCK_DETECTED",
        jobId: job.jobId,
        ownerId: job.ownerId,
        diagnosticId,
        errorCode: "reclaim_unavailable",
      });
      await store.recordRecovery(false);
      continue;
    }
    const reclaimed = await store.reclaimStuckJob({
      jobId: job.jobId,
      nowMs,
      stuckMs: WORK_QUEUE_STUCK_MS,
      attempt,
      retryAt: decision.retryAt ?? null,
      status: nextStatus,
      diagnosticId,
      lastError:
        nextStatus === "retry_scheduled"
          ? "heartbeat timeout — scheduled for recovery"
          : "stuck and not recoverable",
    });

    if (!reclaimed) {
      await store.recordRecovery(false);
      continue;
    }

    await store.recordRecovery(nextStatus === "retry_scheduled");
    if (nextStatus === "retry_scheduled") {
      recovered += 1;
      logWorkQueue({
        event: "JOB_RECOVERED",
        jobId: job.jobId,
        ownerId: job.ownerId,
        diagnosticId,
        attempt,
      });
    }
  }
  return recovered;
}

export async function drainWorkQueue(options?: {
  workerId?: string;
  limit?: number;
  leaseMs?: number;
  /** Graceful shutdown — stop leasing new work when aborted. */
  signal?: AbortSignal;
  /**
   * P2-03: when true, skip stuck recovery (caller already recovered once
   * before horizontal fan-out).
   */
  skipRecover?: boolean;
}): Promise<WorkerDrainResult> {
  const store = getWorkQueueStore();
  const workerId = options?.workerId ?? `worker_${randomUUID().slice(0, 8)}`;
  const limit = options?.limit ?? WORK_QUEUE_WORKER_BATCH;
  const leaseMs = options?.leaseMs ?? WORK_QUEUE_LEASE_MS;

  if (options?.signal?.aborted) {
    return {
      workerId,
      leased: 0,
      completed: 0,
      failed: 0,
      retried: 0,
      recovered: 0,
      completedJobs: [],
      failedJobs: [],
    };
  }

  const recovered = options?.skipRecover ? 0 : await recoverStuckJobs();
  const leased = await store.leaseJobs({ workerId, limit, leaseMs });
  let completed = 0;
  let failed = 0;
  let retried = 0;
  const completedJobs: WorkerDrainResult["completedJobs"] = [];
  const failedJobs: WorkerDrainResult["failedJobs"] = [];

  for (const job of leased) {
    if (options?.signal?.aborted) {
      // Release unused leases so another worker can reclaim after expiry.
      break;
    }
    logWorkQueue({
      event: "JOB_LEASED",
      jobId: job.jobId,
      runId: job.runId,
      ownerId: job.ownerId,
      automationId: job.automationId,
      occurrenceKey: job.occurrenceKey,
    });
    const outcome = await processLeasedJob(job, workerId);
    if (outcome === "completed") {
      completed += 1;
      completedJobs.push({
        jobId: job.jobId,
        runId: job.runId,
        automationId: job.automationId,
        status: "completed",
      });
    } else if (outcome === "retried") {
      retried += 1;
    } else {
      failed += 1;
      const latest = await store.getJob(job.jobId);
      failedJobs.push({
        jobId: job.jobId,
        runId: job.runId,
        automationId: job.automationId,
        status:
          latest?.status === "dead_letter" ? "dead_letter" : "failed",
        errorCode: latest?.errorCode ?? null,
      });
    }
  }

  return {
    workerId,
    leased: leased.length,
    completed,
    failed,
    retried,
    recovered,
    completedJobs,
    failedJobs,
  };
}
