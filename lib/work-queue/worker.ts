import { randomUUID } from "node:crypto";

import {
  WORK_QUEUE_HEARTBEAT_MS,
  WORK_QUEUE_LEASE_MS,
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
import { resolveShutdownLeaseGraceMs } from "@/lib/persistence/durable-sot/lease-config";
import type { DurableSotWorkQueueStore } from "@/lib/persistence/durable-sot/adapters/work-queue-store";

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

function fenceOf(job: WorkJobRecord) {
  if (!job.leaseToken) return undefined;
  return {
    leaseToken: job.leaseToken,
    leaseVersion: job.leaseVersion ?? 0,
  };
}

function asDurableStore(
  store: ReturnType<typeof getWorkQueueStore>,
): DurableSotWorkQueueStore | null {
  const candidate = store as unknown as Partial<DurableSotWorkQueueStore>;
  if (typeof candidate.recoverStuckDurable === "function") {
    return candidate as DurableSotWorkQueueStore;
  }
  return null;
}

async function processLeasedJob(
  job: WorkJobRecord,
  workerId: string,
  signal?: AbortSignal,
): Promise<"completed" | "failed" | "retried" | "lease_lost"> {
  const store = getWorkQueueStore();
  const started = Date.now();
  const fence = fenceOf(job);
  let leaseLost = false;
  let currentStepId: string | null = null;

  const running = await store.updateJob(
    job.jobId,
    { status: "running", heartbeatAt: new Date().toISOString() },
    workerId,
    fence,
  );
  if (!running) return "lease_lost";

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
    void store
      .heartbeat(job.jobId, workerId, WORK_QUEUE_LEASE_MS, {
        leaseToken: job.leaseToken,
        leaseVersion: job.leaseVersion,
        workerInstanceId: job.workerInstanceId ?? workerId,
        currentStepId,
        currentStage: currentStepId ? "step" : "job",
        progressMarker: currentStepId,
        runId: job.runId,
      })
      .then((ok) => {
        if (ok) {
          logWorkQueue({
            event: "HEARTBEAT",
            jobId: job.jobId,
            ownerId: job.ownerId,
          });
        } else {
          leaseLost = true;
        }
      });
  }, WORK_QUEUE_HEARTBEAT_MS);

  try {
    const current = (await store.getJob(job.jobId)) ?? running;
    const previousOutputs = mergeOutputs(current.steps);

    for (const step of [...current.steps].sort(
      (a, b) => a.stepIndex - b.stepIndex,
    )) {
      if (signal?.aborted || leaseLost) {
        // Graceful / lease-lost: do not mark completed; persist recovery-capable state.
        const grace = resolveShutdownLeaseGraceMs();
        await store.updateJob(
          job.jobId,
          {
            leaseExpiresAt: new Date(Date.now() + grace).toISOString(),
            heartbeatAt: new Date().toISOString(),
            lastError: leaseLost
              ? "lease_lost_stop"
              : "graceful_shutdown_in_progress",
          },
          workerId,
          fence,
        );
        return leaseLost ? "lease_lost" : "retried";
      }

      // Skip completed steps — Step-unit recovery resume point.
      if (step.status === "completed" || step.status === "skipped") {
        Object.assign(previousOutputs, step.outputBindings);
        continue;
      }
      if (step.status === "cancelled") {
        break;
      }

      currentStepId = step.stepId;
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

      const hbOk = await store.heartbeat(
        job.jobId,
        workerId,
        WORK_QUEUE_LEASE_MS,
        {
          leaseToken: job.leaseToken,
          leaseVersion: job.leaseVersion,
          workerInstanceId: job.workerInstanceId ?? workerId,
          currentStepId: step.stepId,
          currentStage: step.stepType,
          progressMarker: `step:${step.stepIndex}`,
          runId: job.runId,
        },
      );
      if (!hbOk) {
        leaseLost = true;
        return "lease_lost";
      }

      const result = await executeWorkStep({
        job: current,
        step: runningStep,
        previousOutputs,
      });

      if (leaseLost) return "lease_lost";

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
        const updated = await store.updateJob(
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
            leaseToken: null,
          },
          workerId,
          fence,
        );
        if (!updated) return "lease_lost";
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

      const failed = await store.updateJob(
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
          leaseToken: null,
          resultSummary: decision.userMessage,
        },
        workerId,
        fence,
      );
      if (!failed) return "lease_lost";
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
      const failed = await store.updateJob(
        job.jobId,
        {
          status: "failed",
          completedAt: doneAt,
          leaseOwner: null,
          leaseExpiresAt: null,
          leaseToken: null,
          errorCode: gate.errorCode,
          failedStage: "completion_gate",
          lastError: gate.errorMessage,
          resultSummary: gate.errorMessage,
        },
        workerId,
        fence,
      );
      if (!failed) return "lease_lost";
      logWorkQueue({
        event: "JOB_FAILED",
        jobId: job.jobId,
        ownerId: job.ownerId,
        errorCode: gate.errorCode,
      });
      return "failed";
    }

    const completed = await store.updateJob(
      job.jobId,
      {
        status: "completed",
        completedAt: doneAt,
        leaseOwner: null,
        leaseExpiresAt: null,
        leaseToken: null,
        resultSummary: gate.summary,
        errorCode: null,
        failedStage: null,
      },
      workerId,
      fence,
    );
    if (!completed) return "lease_lost";
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

  // Prefer Phase 1-4 durable recovery orchestrator when available.
  const durable = asDurableStore(store);
  if (durable) {
    const result = await durable.recoverStuckDurable({
      nowMs,
      recoveryWorkerId: `recovery_${randomUUID().slice(0, 8)}`,
    });
    return result.recovered;
  }

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
    if (decision.retryable && decision.retryAt) {
      // Do not re-run completed steps — only re-queue job; worker skips completed.
      await store.updateJob(job.jobId, {
        status: "retry_scheduled",
        attempt,
        retryAt: decision.retryAt,
        availableAt: decision.retryAt,
        errorCode: "stuck_recovered",
        diagnosticId,
        leaseOwner: null,
        leaseExpiresAt: null,
        leaseToken: null,
        lastError: "heartbeat timeout — scheduled for recovery",
      });
      await store.recordRecovery(true);
      recovered += 1;
      logWorkQueue({
        event: "JOB_RECOVERED",
        jobId: job.jobId,
        ownerId: job.ownerId,
        diagnosticId,
        attempt,
      });
    } else {
      await store.updateJob(job.jobId, {
        status: decision.deadLetter ? "dead_letter" : "failed",
        attempt,
        diagnosticId,
        errorCode: "stuck_recovered",
        completedAt: new Date(nowMs).toISOString(),
        leaseOwner: null,
        leaseExpiresAt: null,
        leaseToken: null,
        lastError: "stuck and not recoverable",
      });
      await store.recordRecovery(false);
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
}): Promise<WorkerDrainResult> {
  const store = getWorkQueueStore();
  const workerId = options?.workerId ?? `worker_${randomUUID().slice(0, 8)}`;
  const workerInstanceId = `${workerId}:${process.pid}`;
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

  const recovered = await recoverStuckJobs();
  const leased = await store.leaseJobs({
    workerId,
    limit,
    leaseMs,
    workerInstanceId,
  });
  let completed = 0;
  let failed = 0;
  let retried = 0;
  const completedJobs: WorkerDrainResult["completedJobs"] = [];
  const failedJobs: WorkerDrainResult["failedJobs"] = [];

  for (const job of leased) {
    if (options?.signal?.aborted) {
      // Graceful shutdown: shorten unused leases so peers can reclaim soon.
      // Never mark incomplete work as completed.
      const grace = resolveShutdownLeaseGraceMs();
      await store.updateJob(
        job.jobId,
        {
          status: "queued",
          availableAt: new Date().toISOString(),
          leaseOwner: null,
          leaseExpiresAt: null,
          leaseToken: null,
          lastError: "graceful_shutdown_release",
        },
        workerId,
        fenceOf(job),
      );
      // Best-effort heartbeat finalization marker via shortened window if still owned.
      void grace;
      continue;
    }
    logWorkQueue({
      event: "JOB_LEASED",
      jobId: job.jobId,
      runId: job.runId,
      ownerId: job.ownerId,
      automationId: job.automationId,
      occurrenceKey: job.occurrenceKey,
    });
    const outcome = await processLeasedJob(job, workerId, options?.signal);
    if (outcome === "completed") {
      completed += 1;
      completedJobs.push({
        jobId: job.jobId,
        runId: job.runId,
        automationId: job.automationId,
        status: "completed",
      });
    } else if (outcome === "retried" || outcome === "lease_lost") {
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
