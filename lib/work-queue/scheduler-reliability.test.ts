import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { computeNextRun, zonedTimeToUtc } from "@/lib/automations/schedule";
import { shouldAwaitXPostApproval } from "@/lib/automations/x-recurring/destination";
import { detectOneShotXSchedule } from "@/lib/integrations/x/post/one-shot-schedule";
import type { Automation } from "@/lib/automations/types";

import { WORK_QUEUE_CLOCK_SKEW_MS, WORK_QUEUE_LEASE_MS } from "./constants";
import { buildWorkJobDiagnostics } from "./job-diagnostics";
import { classifyDueOccurrence } from "./missed-run";
import { auditSchedulerProductionConfig } from "./production-config-audit";
import { PRODUCTION_SCHEDULER_SOT } from "./production-sot";
import { classifyErrorCode, decideRetry } from "./retry";
import { estimateSchedulerCost, SCHEDULER_AI_CALLS_PER_TICK } from "./scheduler-cost";
import { enqueueDueAutomations } from "./scheduler";
import {
  evaluateSchedulerHealth,
  buildSchedulerHealthSnapshotFromMetrics,
} from "./scheduler-health";
import {
  classifySchedulerUserNotification,
  shouldNotifySchedulerUser,
} from "./scheduler-notification";
import { resetWorkQueueStoreForTests } from "./store";
import type { WorkQueueStore } from "./store";
import type { WorkJobRecord, WorkQueueMetrics } from "./types";
import { drainWorkQueue } from "./worker";

let dir: string;
let store: WorkQueueStore;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "wq-rel-"));
  process.env.ATLAS_WORK_QUEUE_FORCE_FILE = "true";
  process.env.ATLAS_WORK_QUEUE_FILE = join(dir, "queue.json");
  process.env.ATLAS_WORK_QUEUE_OFFLINE_NOTIFY = "1";
  delete process.env.ATLAS_WORK_QUEUE_SANDBOX;
  store = resetWorkQueueStoreForTests(process.env.ATLAS_WORK_QUEUE_FILE);
  await store.resetForTests();
});

afterEach(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

function tokyoDaily(hour: number, minute = 0, weekdays?: number[]) {
  return {
    kind: "schedule" as const,
    preset: { type: "daily" as const, hour, minute, weekdays },
    timezone: "Asia/Tokyo",
    label: "daily",
  };
}

describe("STEP 1 — Production Scheduler SoT", () => {
  it("documents a single production path (no second scheduler)", () => {
    expect(PRODUCTION_SCHEDULER_SOT.schedulerEntrypoint).toBe(
      "POST /api/automations/tick",
    );
    expect(PRODUCTION_SCHEDULER_SOT.productionMinuteDriver).toContain(
      "minute-scheduler.yml",
    );
    expect(PRODUCTION_SCHEDULER_SOT.hobbyDailyFallback).toContain("0 0 * * *");
    expect(PRODUCTION_SCHEDULER_SOT.claimFn).toBe("WorkQueueStore.leaseJobs");
  });
});

describe("STEP 2 — Asia/Tokyo schedule accuracy (no 9h drift)", () => {
  it("one-shot 明日の12時 is 03:00 UTC the next calendar day", () => {
    const now = new Date("2026-08-13T01:00:00.000Z"); // 2026-08-13 10:00 JST
    const oneShot = detectOneShotXSchedule("明日の12時にXへ投稿して", now);
    expect(oneShot).toBeTruthy();
    expect(oneShot!.timezone).toBe("Asia/Tokyo");
    expect(oneShot!.hour).toBe(12);
    expect(oneShot!.scheduledFor).toBe("2026-08-14T03:00:00.000Z");
  });

  it("daily 毎朝8時 is 23:00 UTC previous day", () => {
    const from = new Date("2026-08-13T14:00:00.000Z"); // 23:00 JST Aug 13
    const next = computeNextRun(tokyoDaily(8, 0), from);
    expect(next?.toISOString()).toBe("2026-08-13T23:00:00.000Z");
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Tokyo",
      hour: "2-digit",
      hour12: false,
    }).formatToParts(next!);
    expect(parts.find((p) => p.type === "hour")?.value).toBe("08");
  });

  it("weekdays 平日9時 fires Mon–Fri only", () => {
    const fridayNight = new Date("2026-08-14T15:00:00.000Z"); // Sat 00:00 JST
    const next = computeNextRun(tokyoDaily(9, 0, [1, 2, 3, 4, 5]), fridayNight);
    // Next weekday 9:00 JST = Monday 2026-08-17 00:00 UTC
    expect(next?.toISOString()).toBe("2026-08-17T00:00:00.000Z");
    const dow = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Tokyo",
      weekday: "short",
    }).format(next!);
    expect(dow).toBe("Mon");
  });

  it("weekly 毎週月曜10時 is Monday only", () => {
    const from = new Date("2026-08-14T00:00:00.000Z"); // Fri 09:00 JST
    const next = computeNextRun(
      {
        kind: "schedule",
        preset: { type: "weekly", dayOfWeek: 1, hour: 10, minute: 0 },
        timezone: "Asia/Tokyo",
        label: "weekly",
      },
      from,
    );
    expect(next?.toISOString()).toBe("2026-08-17T01:00:00.000Z");
  });

  it("monthly 毎月1日9時 and month-end / leap year", () => {
    const from = new Date("2026-01-15T00:00:00.000Z");
    const next = computeNextRun(
      {
        kind: "schedule",
        preset: { type: "monthly", dayOfMonth: 1, hour: 9, minute: 0 },
        timezone: "Asia/Tokyo",
        label: "monthly",
      },
      from,
    );
    expect(next?.toISOString()).toBe("2026-02-01T00:00:00.000Z");

    const jan31 = computeNextRun(
      {
        kind: "schedule",
        preset: { type: "monthly", dayOfMonth: 31, hour: 9, minute: 0 },
        timezone: "Asia/Tokyo",
        label: "eom",
      },
      new Date("2026-01-31T01:00:00.000Z"),
    );
    // Feb 2026 has 28 days → 28th 09:00 JST
    expect(jan31?.toISOString()).toBe("2026-02-28T00:00:00.000Z");

    const leap = zonedTimeToUtc(2024, 2, 29, 9, 0, "Asia/Tokyo");
    expect(leap.toISOString()).toBe("2024-02-29T00:00:00.000Z");
  });
});

describe("STEP 6/7/8 — claim / lease / crash / idempotency", () => {
  it("workers ×2/×5/×10 claim the same occurrence at most once", async () => {
    const scheduledAt = "2026-08-14T00:00:00.000Z";
    await enqueueDueAutomations({
      candidates: [
        {
          automationId: "auto_claim",
          ownerId: "u1",
          name: "claim",
          nextRun: scheduledAt,
          timezone: "Asia/Tokyo",
          enabled: true,
          offlineArtifacts: true,
        },
      ],
      now: new Date("2026-08-14T00:00:30.000Z"),
      advanceNextRun: async () => "2026-08-15T00:00:00.000Z",
    });

    for (const workers of [2, 5, 10]) {
      const jobs = await store.listByStatus("queued", 10);
      if (jobs.length === 0) {
        const leased = await store.listByStatus("leased", 10);
        const running = await store.listByStatus("running", 10);
        const held = [...leased, ...running][0];
        if (held) {
          await store.updateJob(held.jobId, {
            status: "queued",
            leaseOwner: null,
            leaseExpiresAt: null,
            claimedAt: null,
            availableAt: new Date(0).toISOString(),
          });
        }
      }
      const claims = await Promise.all(
        Array.from({ length: workers }, (_, i) =>
          store.leaseJobs({
            workerId: `w_${workers}_${i}`,
            limit: 1,
            leaseMs: WORK_QUEUE_LEASE_MS,
          }),
        ),
      );
      expect(claims.flat()).toHaveLength(1);
      const won = claims.flat()[0]!;
      await store.updateJob(won.jobId, {
        status: "queued",
        leaseOwner: null,
        leaseExpiresAt: null,
        claimedAt: null,
        availableAt: new Date(0).toISOString(),
      });
    }
  });

  it("crash after claim → lease expire → second worker recovers once", async () => {
    const { job } = await store.enqueue({
      ownerId: "u1",
      automationId: "auto_crash",
      occurrenceKey: "occ:auto_crash:Asia/Tokyo:202608140800",
      scheduledAt: "2026-08-13T23:00:00.000Z",
      payload: { kind: "fixture", offlineArtifacts: true, assignment: "crash" },
      steps: [{ stepId: "generate", stepType: "generate_deliverable" }],
    });
    const [claimed] = await store.leaseJobs({
      workerId: "worker_a",
      limit: 1,
      leaseMs: 1,
    });
    expect(claimed?.jobId).toBe(job.jobId);
    await store.updateJob(job.jobId, {
      status: "leased",
      leaseOwner: "worker_a",
      leaseExpiresAt: new Date(
        Date.now() - WORK_QUEUE_CLOCK_SKEW_MS - 20,
      ).toISOString(),
    });
    const drain = await drainWorkQueue({
      workerId: "worker_b",
      limit: 1,
      skipRecover: true,
    });
    expect(drain.completed).toBe(1);
    expect(drain.failed).toBe(0);
    const done = await store.getJob(job.jobId);
    expect(done?.status).toBe("completed");
    expect(done?.leaseOwner).toBeNull();
  });

  it("duplicate scheduler tick does not create a second job", async () => {
    const candidate = {
      automationId: "auto_dup",
      ownerId: "u1",
      name: "dup",
      nextRun: "2026-08-14T00:00:00.000Z",
      timezone: "Asia/Tokyo",
      enabled: true,
      offlineArtifacts: true,
    };
    const first = await enqueueDueAutomations({
      candidates: [candidate],
      now: new Date("2026-08-14T00:00:10.000Z"),
      advanceNextRun: async () => "2026-08-15T00:00:00.000Z",
    });
    const second = await enqueueDueAutomations({
      candidates: [candidate],
      now: new Date("2026-08-14T00:00:20.000Z"),
      advanceNextRun: async () => "2026-08-15T00:00:00.000Z",
    });
    expect(first.enqueued).toBe(1);
    expect(second.enqueued).toBe(0);
    expect(second.deduped).toBe(1);
  });
});

describe("STEP 10/11 — retry classification and storm cap", () => {
  it("retries 429 / 5xx / timeout / network / temporary DB", () => {
    for (const code of [
      "http_429",
      "http_500",
      "http_503",
      "timeout",
      "network_timeout",
      "db_temporary",
    ]) {
      const decision = decideRetry({
        errorCode: code,
        attempt: 1,
        maxAttempts: 5,
      });
      expect(decision.retryable).toBe(true);
      expect(decision.retryAt).toBeTruthy();
    }
  });

  it("does not retry oauth / approval / invalid / missing connection / 4xx", () => {
    for (const code of [
      "oauth_revoked",
      "approval_pending",
      "invalid_payload",
      "x_not_connected",
      "connection_not_configured",
      "auth_expired",
      "http_401",
      "http_403",
    ]) {
      expect(classifyErrorCode(code)).toBe("non_retryable");
      expect(
        decideRetry({ errorCode: code, attempt: 1, maxAttempts: 5 }).retryable,
      ).toBe(false);
    }
  });

  it("caps retry at max attempts (no infinite retry)", () => {
    const exhausted = decideRetry({
      errorCode: "http_503",
      attempt: 5,
      maxAttempts: 5,
    });
    expect(exhausted.retryable).toBe(false);
    expect(exhausted.deadLetter).toBe(true);
  });
});

describe("STEP 12 — missed run recovery", () => {
  it("8:10 after 8:00 is delayed and still executes", async () => {
    const scheduled = "2026-08-14T23:00:00.000Z"; // 08:00 JST Aug 15
    const now = new Date("2026-08-14T23:10:00.000Z");
    expect(classifyDueOccurrence(scheduled, now).disposition).toBe("delayed");
    const result = await enqueueDueAutomations({
      candidates: [
        {
          automationId: "auto_delay",
          ownerId: "u1",
          name: "delay",
          nextRun: scheduled,
          timezone: "Asia/Tokyo",
          enabled: true,
          offlineArtifacts: true,
        },
      ],
      now,
      advanceNextRun: async () => "2026-08-15T23:00:00.000Z",
    });
    expect(result.enqueued).toBe(1);
    expect(result.delayed).toBe(1);
    expect(result.skipped).toBe(0);
    const jobs = await store.listByStatus("queued", 5);
    expect(jobs[0]?.payload.missedDisposition).toBe("delayed");
    expect(jobs[0]?.status).not.toBe("completed");
  });

  it("25h late is skipped, not completed, and still advances nextRun", async () => {
    let advanced = 0;
    const scheduled = "2026-08-13T23:00:00.000Z";
    const now = new Date("2026-08-15T00:10:00.000Z");
    expect(classifyDueOccurrence(scheduled, now).disposition).toBe("skipped");
    const result = await enqueueDueAutomations({
      candidates: [
        {
          automationId: "auto_skip",
          ownerId: "u1",
          name: "skip",
          nextRun: scheduled,
          timezone: "Asia/Tokyo",
          enabled: true,
          offlineArtifacts: true,
        },
      ],
      now,
      advanceNextRun: async () => {
        advanced += 1;
        return "2026-08-15T23:00:00.000Z";
      },
    });
    expect(result.enqueued).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.advanced).toBe(1);
    expect(advanced).toBe(1);
    const queued = await store.listByStatus("queued", 5);
    const completed = await store.listByStatus("completed", 5);
    expect(queued).toHaveLength(0);
    expect(completed).toHaveLength(0);
  });

  it("missed (2h late) still executes once", async () => {
    const scheduled = "2026-08-14T23:00:00.000Z";
    const now = new Date("2026-08-15T01:00:00.000Z");
    expect(classifyDueOccurrence(scheduled, now).disposition).toBe("missed");
    const result = await enqueueDueAutomations({
      candidates: [
        {
          automationId: "auto_miss",
          ownerId: "u1",
          name: "miss",
          nextRun: scheduled,
          timezone: "Asia/Tokyo",
          enabled: true,
          offlineArtifacts: true,
        },
      ],
      now,
      advanceNextRun: async () => "2026-08-15T23:00:00.000Z",
    });
    expect(result.enqueued).toBe(1);
    expect(result.missed).toBe(1);
  });
});

describe("STEP 14 — approval gate", () => {
  it("approve_then_run waits; full_auto does not", () => {
    const base = {
      id: "auto_x",
      userId: "u1",
      name: "X",
      enabled: true,
      destination: "x",
      executionLevel: "approve_then_run",
    } as unknown as Automation;
    expect(
      shouldAwaitXPostApproval({
        ...base,
        executionLevel: "approve_then_run",
      } as Automation),
    ).toBe(true);
    expect(
      shouldAwaitXPostApproval({
        ...base,
        executionLevel: "full_auto",
      } as Automation),
    ).toBe(false);
  });
});

describe("STEP 15 — notification separation", () => {
  it("success / delayed / permanent notify; retry stays silent", () => {
    expect(classifySchedulerUserNotification("success")).toBe("success");
    expect(classifySchedulerUserNotification("delayed")).toBe("delayed");
    expect(classifySchedulerUserNotification("retry")).toBe("retry_silent");
    expect(classifySchedulerUserNotification("permanent_failure")).toBe(
      "permanent_failure",
    );
    expect(shouldNotifySchedulerUser("retry_silent")).toBe(false);
    expect(shouldNotifySchedulerUser("success")).toBe(true);
  });
});

describe("STEP 16/18 — observability + health", () => {
  it("builds the required health snapshot fields", () => {
    const metrics: WorkQueueMetrics = {
      queued: 2,
      waiting: 2,
      leased: 1,
      running: 1,
      retryScheduled: 3,
      stuck: 1,
      failed: 4,
      deadLetter: 1,
      completed: 10,
      oldestQueuedAgeMs: 12_000,
      duplicateCount: 7,
      schedulerLastSuccessAt: "2026-08-14T00:00:00.000Z",
      p95ScheduleDelayMs: 100,
      p99ScheduleDelayMs: 200,
      averageDelayMs: 50,
      p95ExecutionMs: 800,
      recoverySuccessRate: 1,
      alive: true,
      workerCount: 2,
      successRate: 0.9,
      failureRate: 0.1,
      averageQueueWaitMs: 12_000,
      workerBusyPercent: 50,
    };
    const snap = buildSchedulerHealthSnapshotFromMetrics({
      metrics,
      enqueue: {
        due: 5,
        skipped: 1,
        missed: 2,
        delayed: 1,
        deduped: 3,
      },
      lastTickAt: "2026-08-14T00:00:30.000Z",
      nowMs: Date.parse("2026-08-14T00:01:00.000Z"),
    });
    expect(snap.schedulerHealth).toBe("ok");
    expect(snap.lastTickAt).toBe("2026-08-14T00:00:30.000Z");
    expect(snap.lastSuccessfulTickAt).toBe("2026-08-14T00:00:00.000Z");
    expect(snap.dueCount).toBe(5);
    expect(snap.queuedCount).toBe(2);
    expect(snap.runningCount).toBe(2);
    expect(snap.failedCount).toBe(5);
    expect(snap.retryCount).toBe(3);
    expect(snap.staleLeaseCount).toBe(1);
    expect(snap.oldestDueAge).toBe(12_000);
    expect(snap.executionLatency).toBe(800);
    expect(snap.duplicatePreventedCount).toBe(10);
    expect(snap.missedRunCount).toBe(2);
  });

  it("DEGRADED at 5 minutes and DOWN at 15 minutes", () => {
    const success = "2026-08-14T00:00:00.000Z";
    expect(
      evaluateSchedulerHealth({
        lastSuccessfulTickAt: success,
        nowMs: Date.parse("2026-08-14T00:06:00.000Z"),
      }),
    ).toBe("degraded");
    expect(
      evaluateSchedulerHealth({
        lastSuccessfulTickAt: success,
        nowMs: Date.parse("2026-08-14T00:16:00.000Z"),
      }),
    ).toBe("down");
  });
});

describe("STEP 17 — diagnostics never leak secrets", () => {
  it("emits required ids without tokens", () => {
    const job = {
      jobId: "job_1",
      runId: "run_1",
      automationId: "auto_1",
      occurrenceKey: "occ:auto_1:Asia/Tokyo:202608140800",
      scheduledAt: "2026-08-13T23:00:00.000Z",
      claimedAt: "2026-08-13T23:00:05.000Z",
      startedAt: "2026-08-13T23:00:06.000Z",
      completedAt: null,
      leaseOwner: "w1",
      leaseExpiresAt: "2026-08-13T23:01:06.000Z",
      heartbeatAt: "2026-08-13T23:00:20.000Z",
      attempt: 2,
      errorCode: "http_503",
      failedStage: "run",
      diagnosticId: "diag_test",
      payload: { kind: "automation", assignment: "Xへ投稿" },
      steps: [
        {
          outputBindings: {
            tweetId: "tw_1",
            authorization: "Bearer SECRET",
          },
        },
      ],
    } as unknown as WorkJobRecord;
    const diag = buildWorkJobDiagnostics(job, { workerId: "w1" });
    const serialized = JSON.stringify(diag);
    expect(diag.automationId).toBe("auto_1");
    expect(diag.occurrenceId).toContain("occ:");
    expect(diag.runId).toBe("run_1");
    expect(diag.jobId).toBe("job_1");
    expect(diag.diagnosticId).toBe("diag_test");
    expect(diag.provider).toBe("x");
    expect(diag.externalActionId).toBe("tw_1");
    expect(serialized).not.toMatch(/Bearer|SECRET|authorization/i);
  });
});

describe("STEP 19 — load (10 / 100 / 1000 same-slot)", () => {
  it("10 and 100 same-slot automations enqueue once each (duplicate 0)", async () => {
    for (const count of [10, 100]) {
      await store.resetForTests();
      const now = new Date("2026-08-14T00:00:05.000Z");
      const candidates = Array.from({ length: count }, (_, i) => ({
        automationId: `auto_load_${count}_${i}`,
        ownerId: "load",
        name: `load ${i}`,
        nextRun: "2026-08-14T00:00:00.000Z",
        timezone: "Asia/Tokyo",
        enabled: true,
        offlineArtifacts: true,
      }));
      const first = await enqueueDueAutomations({
        candidates,
        now,
        limit: count,
        advanceNextRun: async () => "2026-08-15T00:00:00.000Z",
      });
      const second = await enqueueDueAutomations({
        candidates,
        now,
        limit: count,
        advanceNextRun: async () => "2026-08-15T00:00:00.000Z",
      });
      expect(first.enqueued).toBe(count);
      expect(second.enqueued).toBe(0);
      expect(second.deduped).toBe(count);
    }
  });

  it("1000 same-slot simulation: enqueue once, 10-way claim partitions with duplicate 0", async () => {
    process.env.ATLAS_WORK_QUEUE_MEMORY_FAST = "true";
    const fast = resetWorkQueueStoreForTests(process.env.ATLAS_WORK_QUEUE_FILE);
    await fast.resetForTests();
    const now = new Date("2026-08-14T00:00:05.000Z");
    const candidates = Array.from({ length: 1000 }, (_, i) => ({
      automationId: `auto_1k_${i}`,
      ownerId: "load1k",
      name: `k ${i}`,
      nextRun: "2026-08-14T00:00:00.000Z",
      timezone: "Asia/Tokyo",
      enabled: true,
      offlineArtifacts: true,
    }));
    const first = await enqueueDueAutomations({
      candidates,
      now,
      limit: 1000,
      advanceNextRun: async () => "2026-08-15T00:00:00.000Z",
    });
    expect(first.enqueued).toBe(1000);
    const claims = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        fast.leaseJobs({
          workerId: `load_w_${i}`,
          limit: 100,
          leaseMs: WORK_QUEUE_LEASE_MS,
        }),
      ),
    );
    const ids = claims.flat().map((job) => job.jobId);
    expect(ids).toHaveLength(1000);
    expect(new Set(ids).size).toBe(1000);
    delete process.env.ATLAS_WORK_QUEUE_MEMORY_FAST;
  });
});

describe("STEP 20 — failure injection", () => {
  it("classifies provider 429/500 as retry and auth revoked as permanent", () => {
    expect(classifyErrorCode("http_429")).toBe("retryable");
    expect(classifyErrorCode("http_500")).toBe("retryable");
    expect(classifyErrorCode("oauth_revoked")).toBe("non_retryable");
  });
});

describe("STEP 21 — external adapter entrypoints still exist", () => {
  it("keeps X / Gmail / Calendar / Dropbox / WordPress adapters", async () => {
    const x = await import("@/lib/integrations/x/post/api-client");
    const gmail = await import("@/lib/integrations/google/gmail/api-client");
    const calendar = await import("@/lib/integrations/google/calendar/api-client");
    const dropbox = await import("@/lib/integrations/dropbox/api-client");
    const wp = await import("@/lib/integrations/wordpress/post/service");
    expect(typeof x.createTweet).toBe("function");
    expect(typeof gmail.sendGmailMessage).toBe("function");
    expect(typeof calendar.createGoogleCalendarEvent).toBe("function");
    expect(typeof dropbox.uploadDropboxFile).toBe("function");
    expect(typeof wp.createWordPressPostForUser).toBe("function");
  });
});

describe("STEP 22 — scheduler cost (AI = 0)", () => {
  it("estimates 100 / 1000 / 10000 users with zero AI calls", () => {
    expect(SCHEDULER_AI_CALLS_PER_TICK).toBe(0);
    for (const users of [100, 1000, 10_000]) {
      const cost = estimateSchedulerCost(users);
      expect(cost.ticksPerDay).toBe(1440);
      expect(cost.ticksPerMonth).toBe(43_200);
      expect(cost.aiCallsPerMonth).toBe(0);
      expect(cost.githubActionJobsPerMonth).toBe(43_200);
    }
  });
});

describe("STEP 23 — production config presence", () => {
  it("reports EXTERNAL CONFIGURATION REQUIRED without leaking values", () => {
    const audit = auditSchedulerProductionConfig();
    expect(audit.verdict === "ready" || audit.verdict === "EXTERNAL CONFIGURATION REQUIRED").toBe(
      true,
    );
    const serialized = JSON.stringify(audit);
    expect(serialized).not.toMatch(/sk_live|sk_test|whsec_|-----BEGIN/);
    expect(audit.items.some((item) => item.key === "CRON_SECRET")).toBe(true);
    expect(audit.items.some((item) => item.key === "ATLAS_APP_URL")).toBe(true);
  });
});
