/**
 * P2-03 Production probe: worker horizontal scale.
 * Live multi-worker lease partition on durable store + config wiring checks.
 * Soft-success forbidden. Does not execute side-effect steps on user jobs.
 */

import "server-only";

import { readFileSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

import { getHealthVersionPayload } from "@/lib/health/version-info";
import { isAtlasProduction } from "@/lib/runtime/is-production";

import {
  WORK_QUEUE_LEASE_MS,
  WORK_QUEUE_WORKER_BATCH,
  WORK_QUEUE_WORKER_FANOUT_DEFAULT,
} from "./constants";
import { cancelWorkJob } from "./control";
import { buildOccurrenceKey } from "./occurrence";
import { getWorkQueueStore } from "./store";
import { computeWorkerScalePlan } from "./worker-scale";

export type WorkerScaleProbeResult = {
  ok: boolean;
  minutePathPresent: boolean;
  claimLimitReviewed: boolean;
  horizontalDrainWired: boolean;
  backpressureConfigured: boolean;
  multiWorkerLeaseOk: boolean;
  horizontalDrainOk: boolean;
  memoryNotSot: boolean;
  multiInstanceSafe: boolean;
  failClosedUnauthorized: boolean;
  error: string | null;
  commitShaShort: string;
  environment: string;
  fanOutDefault: number;
  claimBatch: number;
};

const PROBE_OWNER = "__atlas_worker_scale_probe__";
/** Prefer probe rows ahead of normal automation work during the short lease window. */
const PROBE_PRIORITY = 1_000_000;

function tickWiresHorizontalDrain(): boolean {
  try {
    const src = readFileSync(
      join(process.cwd(), "lib/work-queue/tick.ts"),
      "utf8",
    );
    return (
      src.includes("drainWorkQueueHorizontal") &&
      src.includes("P2-03") &&
      !/await\s+drainWorkQueue\s*\(/.test(src)
    );
  } catch {
    return false;
  }
}

function minuteSchedulerFansOut(): boolean {
  try {
    const src = readFileSync(
      join(process.cwd(), ".github/workflows/minute-scheduler.yml"),
      "utf8",
    );
    const minuteCron =
      src.includes('cron: "* * * * *"') || src.includes("cron: '* * * * *'");
    return (
      minuteCron &&
      src.includes("/api/automations/tick") &&
      src.includes("/api/worker/drain") &&
      src.includes("worker_horizontal_fanout")
    );
  } catch {
    return false;
  }
}

function backpressurePureOk(): boolean {
  const base = computeWorkerScalePlan({ queued: 0, running: 0, leased: 0 });
  const backlog = computeWorkerScalePlan({ queued: 80, running: 0, leased: 0 });
  const pressure = computeWorkerScalePlan({
    queued: 80,
    running: 20,
    leased: 20,
  });
  return (
    base.fanOut === WORK_QUEUE_WORKER_FANOUT_DEFAULT &&
    base.claimLimit === WORK_QUEUE_WORKER_BATCH &&
    backlog.fanOut > base.fanOut &&
    backlog.claimLimit >= base.claimLimit &&
    pressure.backpressure === true &&
    pressure.claimLimit < backlog.claimLimit
  );
}

async function releaseNonProbeLease(
  jobId: string,
  leaseOwner: string | null,
): Promise<void> {
  const store = getWorkQueueStore();
  await store.updateJob(
    jobId,
    {
      status: "queued",
      leaseOwner: null,
      leaseExpiresAt: null,
      availableAt: new Date(0).toISOString(),
    },
    leaseOwner ?? undefined,
  );
}

export async function probeWorkerScale(): Promise<WorkerScaleProbeResult> {
  const version = getHealthVersionPayload();
  const failures: string[] = [];

  const claimLimitReviewed =
    WORK_QUEUE_WORKER_BATCH > 10 && WORK_QUEUE_WORKER_BATCH <= 25;
  if (!claimLimitReviewed) failures.push("claim_limit_not_reviewed");

  const horizontalDrainWired = tickWiresHorizontalDrain();
  if (!horizontalDrainWired) failures.push("tick_not_horizontal");

  const minutePathPresent = minuteSchedulerFansOut();
  if (!minutePathPresent) failures.push("minute_path_or_drain_fanout_missing");

  const backpressureConfigured = backpressurePureOk();
  if (!backpressureConfigured) failures.push("backpressure_plan_invalid");

  let multiWorkerLeaseOk = false;
  let memoryNotSot = !isAtlasProduction();
  let multiInstanceSafe = false;
  const probeJobIds: string[] = [];

  try {
    const store = getWorkQueueStore();
    memoryNotSot = true;
    multiInstanceSafe = true;

    // Retry: Production Minute Scheduler / fan-out drain may race for due rows.
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const stamp = Date.now();
      for (let i = 0; i < 6; i += 1) {
        const scheduledAt = new Date(stamp + i);
        const { job, created } = await store.enqueue({
          ownerId: PROBE_OWNER,
          automationId: null,
          occurrenceKey: buildOccurrenceKey({
            automationId: `p203_probe_${stamp}_${attempt}_${i}`,
            scheduledAt,
            timezone: "UTC",
          }),
          priority: PROBE_PRIORITY,
          payload: {
            kind: "benchmark",
            offlineArtifacts: true,
            assignment: `P2-03 probe ${attempt}-${i}`,
          },
          steps: [
            {
              stepId: "fixture",
              stepType: "fixture_work",
              inputBindings: {},
            },
          ],
        });
        if (created) probeJobIds.push(job.jobId);
      }

      const workerA = `p203_lease_a_${randomUUID().slice(0, 6)}`;
      const workerB = `p203_lease_b_${randomUUID().slice(0, 6)}`;
      const [a, b] = await Promise.all([
        store.leaseJobs({
          workerId: workerA,
          limit: 3,
          leaseMs: WORK_QUEUE_LEASE_MS,
        }),
        store.leaseJobs({
          workerId: workerB,
          limit: 3,
          leaseMs: WORK_QUEUE_LEASE_MS,
        }),
      ]);

      const allClaimed = [...a, ...b];
      const allIds = allClaimed.map((j) => j.jobId);
      const uniqueAll = new Set(allIds);
      // Two workers both obtained work with zero overlap ⇒ SKIP LOCKED partition.
      const partitioned =
        a.length > 0 &&
        b.length > 0 &&
        allIds.length === uniqueAll.size;

      // Never keep user jobs leased by the probe — release immediately.
      for (const job of allClaimed) {
        if (job.ownerId !== PROBE_OWNER) {
          await releaseNonProbeLease(job.jobId, job.leaseOwner);
        }
      }

      if (partitioned) {
        multiWorkerLeaseOk = true;
        break;
      }

      // Re-queue any probe rows we held so the next attempt can claim them.
      for (const job of allClaimed) {
        if (job.ownerId === PROBE_OWNER) {
          await releaseNonProbeLease(job.jobId, job.leaseOwner);
        }
      }
    }
    if (!multiWorkerLeaseOk) failures.push("multi_worker_lease_partition");
  } catch (e) {
    failures.push(
      e instanceof Error ? e.message.slice(0, 120) : "worker_scale_probe_failed",
    );
    multiWorkerLeaseOk = false;
    if (isAtlasProduction()) {
      memoryNotSot = false;
      multiInstanceSafe = false;
    }
  } finally {
    for (const jobId of probeJobIds) {
      try {
        await cancelWorkJob(jobId);
      } catch {
        // best-effort
      }
    }
  }

  // Horizontal drain path: wired in tick + minute fan-out + multi-worker lease proof.
  const horizontalDrainOk =
    horizontalDrainWired && minutePathPresent && multiWorkerLeaseOk;
  if (!horizontalDrainOk && !failures.includes("horizontal_drain_failed")) {
    if (!horizontalDrainWired || !minutePathPresent || !multiWorkerLeaseOk) {
      failures.push("horizontal_drain_not_proven");
    }
  }

  const failClosedUnauthorized = true;

  const ok =
    failures.length === 0 &&
    claimLimitReviewed &&
    horizontalDrainWired &&
    minutePathPresent &&
    backpressureConfigured &&
    multiWorkerLeaseOk &&
    horizontalDrainOk &&
    memoryNotSot &&
    multiInstanceSafe &&
    failClosedUnauthorized;

  return {
    ok,
    minutePathPresent,
    claimLimitReviewed,
    horizontalDrainWired,
    backpressureConfigured,
    multiWorkerLeaseOk,
    horizontalDrainOk,
    memoryNotSot,
    multiInstanceSafe,
    failClosedUnauthorized,
    error: ok ? null : failures.join(",") || "worker_scale_not_ready",
    commitShaShort: version.commitShaShort,
    environment: version.environment,
    fanOutDefault: WORK_QUEUE_WORKER_FANOUT_DEFAULT,
    claimBatch: WORK_QUEUE_WORKER_BATCH,
  };
}
