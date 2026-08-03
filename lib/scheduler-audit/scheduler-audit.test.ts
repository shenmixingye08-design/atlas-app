import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { computeNextRun, computeNextRunIso } from "@/lib/automations/schedule";
import { computeNextRunFromSchedule } from "@/lib/automation-platform/schedule/compute";
import { ATLAS_PUBLIC_API_MATCHERS } from "@/lib/auth/public-routes";
import {
  computeSkipNextRunIso,
  computeResumeNextRunIso,
} from "@/lib/work-queue/schedule-math";
import { enqueueDueAutomations } from "@/lib/work-queue/scheduler";
import { buildOccurrenceKey } from "@/lib/work-queue/occurrence";
import {
  getWorkQueueStore,
  resetWorkQueueStoreForTests,
} from "@/lib/work-queue/store";

import {
  ACTIVE_VERCEL_CRON_PATH,
  ACTIVE_VERCEL_CRON_SCHEDULE,
  CRON_DEFINITIONS,
  DRAIN_ROUTE,
  NEXT_RUN_AT_PATHS,
  PRO_TEMPLATE_CRON_SCHEDULE,
  RISK_REGISTER,
  SCHEDULER_ENTRY_POINTS,
  SCHEDULER_SOT,
  SECRET_AUDIT,
  TICK_ROUTE,
  buildSchedulerAuditSnapshot,
  writeSchedulerAuditArtifacts,
} from "./index";

const authMock = vi.fn();
const checkAtlasOwnerMock = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
}));

vi.mock("@/lib/auth/require-atlas-owner", () => ({
  checkAtlasOwner: () => checkAtlasOwnerMock(),
}));

describe("Phase 2-1 scheduler production audit", () => {
  beforeEach(async () => {
    authMock.mockResolvedValue({ userId: null });
    checkAtlasOwnerMock.mockResolvedValue(false);
    vi.stubEnv("ATLAS_WORK_QUEUE_FORCE_FILE", "true");
    const store = resetWorkQueueStoreForTests();
    await store.resetForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    authMock.mockReset();
    checkAtlasOwnerMock.mockReset();
  });

  describe("Production / Preview config diff detection", () => {
    it("detects active vercel.json is daily Hobby schedule, not minute", () => {
      const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as {
        crons: Array<{ path: string; schedule: string }>;
      };
      expect(vercel.crons).toHaveLength(1);
      expect(vercel.crons[0]?.path).toBe(ACTIVE_VERCEL_CRON_PATH);
      expect(vercel.crons[0]?.schedule).toBe(ACTIVE_VERCEL_CRON_SCHEDULE);
      expect(vercel.crons[0]?.schedule).not.toBe(PRO_TEMPLATE_CRON_SCHEDULE);
    });

    it("detects Pro minute template is inactive until copied", () => {
      const pro = JSON.parse(readFileSync("vercel.cron.pro.json", "utf8")) as {
        crons: Array<{ path: string; schedule: string }>;
      };
      expect(pro.crons[0]?.schedule).toBe(PRO_TEMPLATE_CRON_SCHEDULE);
      const active = CRON_DEFINITIONS.find((c) => c.id === "vercel-cron-pro-template");
      expect(active?.activeInRepo).toBe(false);
    });

    it("detects GitHub Actions minute workflow posts to tick with Bearer", () => {
      const yml = readFileSync(".github/workflows/minute-scheduler.yml", "utf8");
      expect(yml).toContain('cron: "* * * * *"');
      expect(yml).toContain("Authorization: Bearer ${CRON_SECRET}");
      expect(yml).toContain("/api/automations/tick");
      expect(yml).toContain("ATLAS_APP_URL");
    });

    it("detects tick is public API but drain is not (Preview/Prod Clerk gap)", () => {
      const joined = ATLAS_PUBLIC_API_MATCHERS.join("\n");
      expect(joined).toContain("automations/tick");
      expect(joined).not.toContain("worker/drain");
      const drainEntry = SCHEDULER_ENTRY_POINTS.find((e) => e.id === "api-worker-drain");
      expect(drainEntry?.productionReachable).toBe(false);
      expect(DRAIN_ROUTE).toBe("/api/worker/drain");
    });
  });

  describe("Cron route authentication", () => {
    it("accepts matching bearer secret (timing-safe path)", async () => {
      const { authorizeAutomationTick } = await import("@/lib/automations/tick-auth");
      vi.stubEnv("CRON_SECRET", "audit-secret");
      vi.stubEnv("VERCEL_ENV", "production");
      const request = new Request(`https://example.com${TICK_ROUTE}`, {
        headers: { authorization: "Bearer audit-secret" },
      });
      await expect(authorizeAutomationTick(request)).resolves.toEqual({ ok: true });
    });

    it("rejects secret mismatch in production without owner", async () => {
      const { authorizeAutomationTick } = await import("@/lib/automations/tick-auth");
      vi.stubEnv("CRON_SECRET", "audit-secret");
      vi.stubEnv("VERCEL_ENV", "production");
      const request = new Request(`https://example.com${TICK_ROUTE}`, {
        headers: { authorization: "Bearer wrong" },
      });
      await expect(authorizeAutomationTick(request)).resolves.toMatchObject({
        ok: false,
        status: 401,
      });
    });

    it("fail-closes when CRON_SECRET unset in production (no success path)", async () => {
      const { authorizeAutomationTick } = await import("@/lib/automations/tick-auth");
      vi.stubEnv("CRON_SECRET", "");
      vi.stubEnv("VERCEL_ENV", "production");
      const request = new Request(`https://example.com${TICK_ROUTE}`);
      await expect(authorizeAutomationTick(request)).resolves.toMatchObject({
        ok: false,
        status: 503,
        error: "CRON_SECRET is not configured",
      });
    });

    it("accepts x-cron-secret header", async () => {
      const { authorizeAutomationTick } = await import("@/lib/automations/tick-auth");
      vi.stubEnv("CRON_SECRET", "header-secret");
      vi.stubEnv("VERCEL_ENV", "production");
      const request = new Request(`https://example.com${TICK_ROUTE}`, {
        headers: { "x-cron-secret": "header-secret" },
      });
      await expect(authorizeAutomationTick(request)).resolves.toEqual({ ok: true });
    });
  });

  describe("nextRunAt calculation + timezone + DST", () => {
    it("Asia/Tokyo daily next is future local wall clock", () => {
      const from = new Date("2026-08-03T00:30:00.000Z"); // 09:30 JST
      const next = computeNextRun(
        {
          kind: "schedule",
          preset: { type: "daily", hour: 9, minute: 0 },
          timezone: "Asia/Tokyo",
          label: "audit",
        },
        from,
      );
      // 09:00 JST already passed → next day 09:00 JST = 2026-08-04T00:00Z
      expect(next!.toISOString()).toBe("2026-08-04T00:00:00.000Z");
    });

    it("UTC daily", () => {
      const from = new Date("2026-08-03T10:00:00.000Z");
      const iso = computeNextRunIso(
        {
          kind: "schedule",
          preset: { type: "daily", hour: 9, minute: 0 },
          timezone: "UTC",
          label: "audit",
        },
        from,
      );
      expect(iso).toBe("2026-08-04T09:00:00.000Z");
    });

    it("America/New_York spring DST forward still yields finite next", () => {
      // US DST spring forward 2026-03-08
      const from = new Date("2026-03-08T06:30:00.000Z");
      const next = computeNextRun(
        {
          kind: "schedule",
          preset: { type: "daily", hour: 2, minute: 30 },
          timezone: "America/New_York",
          label: "audit",
        },
        from,
      );
      expect(next).toBeInstanceOf(Date);
      expect(Number.isNaN(next!.getTime())).toBe(false);
      expect(next!.getTime()).toBeGreaterThan(from.getTime());
    });

    it("Europe/London autumn DST backward still advances", () => {
      const from = new Date("2026-10-25T01:30:00.000Z");
      const next = computeNextRun(
        {
          kind: "schedule",
          preset: { type: "daily", hour: 1, minute: 30 },
          timezone: "Europe/London",
          label: "audit",
        },
        from,
      );
      expect(next!.getTime()).toBeGreaterThan(from.getTime());
    });

    it("month-end February / leap year clamps", () => {
      const from = new Date("2024-01-31T12:00:00.000Z");
      const next = computeNextRun(
        {
          kind: "schedule",
          preset: { type: "monthly", hour: 9, minute: 0, dayOfMonth: 31 },
          timezone: "UTC",
          label: "audit",
        },
        from,
      );
      // Feb 2024 leap → day clamped to 29
      expect(next!.toISOString()).toBe("2024-02-29T09:00:00.000Z");
    });

    it("selected weekday weekly", () => {
      // 2026-08-03 is Monday
      const from = new Date("2026-08-03T00:00:00.000Z");
      const next = computeNextRun(
        {
          kind: "schedule",
          preset: { type: "weekly", hour: 9, minute: 0, dayOfWeek: 3 },
          timezone: "UTC",
          label: "audit",
        },
        from,
      );
      expect(next!.toISOString()).toBe("2026-08-05T09:00:00.000Z");
    });

    it("V2 weekdays + once past returns null", () => {
      const weekdays = computeNextRunFromSchedule(
        {
          frequency: "weekdays",
          hour: 9,
          minute: 0,
        },
        "Asia/Tokyo",
        new Date("2026-08-03T01:00:00.000Z"),
      );
      expect(weekdays).toBeInstanceOf(Date);

      const oncePast = computeNextRunFromSchedule(
        {
          frequency: "once",
          hour: 0,
          minute: 0,
          runAt: "2020-01-01T00:00:00.000Z",
        },
        "UTC",
        new Date("2026-08-03T00:00:00.000Z"),
      );
      expect(oncePast).toBeNull();
    });

    it("resume is future-only; skip advances past slot", () => {
      const schedule = {
        kind: "schedule" as const,
        preset: { type: "daily" as const, hour: 9, minute: 0 },
        timezone: "UTC",
        label: "audit",
      };
      const resume = computeResumeNextRunIso(
        schedule,
        new Date("2026-08-03T10:00:00.000Z"),
      );
      expect(resume).toBe("2026-08-04T09:00:00.000Z");
      const skipped = computeSkipNextRunIso(schedule, "2026-08-04T09:00:00.000Z");
      expect(skipped).toBe("2026-08-05T09:00:00.000Z");
    });
  });

  describe("duplicate / concurrent / partial failure / crash", () => {
    it("duplicate tick same occurrence dedupes jobs", async () => {
      const now = new Date("2026-08-03T09:00:00.000Z");
      const candidate = {
        automationId: "auto-dup",
        ownerId: "owner-1",
        name: "dup",
        nextRun: "2026-08-03T09:00:00.000Z",
        timezone: "UTC",
        enabled: true,
        paused: false,
      };
      let advances = 0;
      const first = await enqueueDueAutomations({
        candidates: [candidate],
        now,
        advanceNextRun: async () => {
          advances += 1;
          return "2026-08-04T09:00:00.000Z";
        },
      });
      const second = await enqueueDueAutomations({
        candidates: [candidate],
        now,
        advanceNextRun: async () => {
          advances += 1;
          return "2026-08-04T09:00:00.000Z";
        },
      });
      expect(first.enqueued).toBe(1);
      expect(second.enqueued).toBe(0);
      expect(second.deduped).toBe(1);
      expect(advances).toBe(2);
      const occ = buildOccurrenceKey({
        automationId: "auto-dup",
        scheduledAt: now,
        timezone: "UTC",
      });
      expect(occ).toContain("auto-dup");
    });

    it("concurrent tick: file store may race; sequential second tick dedupes", async () => {
      // True multi-instance uniqueness requires Postgres unique(occurrence_key).
      // File store is process-local; audit documents this as recovery risk.
      const now = new Date("2026-08-03T09:05:00.000Z");
      const candidate = {
        automationId: "auto-race",
        ownerId: "owner-1",
        name: "race",
        nextRun: "2026-08-03T09:00:00.000Z",
        timezone: "UTC",
        enabled: true,
      };
      const a = await enqueueDueAutomations({
        candidates: [candidate],
        now,
        advanceNextRun: async () => "2026-08-04T09:00:00.000Z",
      });
      const b = await enqueueDueAutomations({
        candidates: [candidate],
        now,
        advanceNextRun: async () => "2026-08-04T09:00:00.000Z",
      });
      expect(a.enqueued).toBe(1);
      expect(b.deduped).toBe(1);
      expect(a.enqueued + b.enqueued).toBe(1);
    });

    it("documents crash-before-nextRunAt-update: job can exist while advance throws", async () => {
      const store = getWorkQueueStore();
      const now = new Date("2026-08-03T09:00:00.000Z");
      let advanced = false;
      await expect(
        enqueueDueAutomations({
          candidates: [
            {
              automationId: "auto-crash",
              ownerId: "owner-1",
              name: "crash",
              nextRun: "2026-08-03T09:00:00.000Z",
              timezone: "UTC",
              enabled: true,
            },
          ],
          now,
          advanceNextRun: async () => {
            advanced = true;
            throw new Error("crash before durable nextRun persist");
          },
        }),
      ).rejects.toThrow(/crash before durable nextRun persist/);
      // Job created before advance — retry can dedupe; nextRun may still be due (re-fire risk mitigated by occurrence).
      expect(advanced).toBe(true);
      const metrics = await store.metrics();
      expect(metrics.queued + metrics.waiting).toBeGreaterThanOrEqual(1);
    });

    it("paused/disabled candidates are excluded", async () => {
      const result = await enqueueDueAutomations({
        candidates: [
          {
            automationId: "disabled",
            ownerId: "o",
            name: "d",
            nextRun: "2020-01-01T00:00:00.000Z",
            enabled: false,
          },
          {
            automationId: "paused",
            ownerId: "o",
            name: "p",
            nextRun: "2020-01-01T00:00:00.000Z",
            enabled: true,
            paused: true,
          },
        ],
        now: new Date(),
        advanceNextRun: async () => null,
      });
      expect(result.due).toBe(0);
      expect(result.enqueued).toBe(0);
    });
  });

  describe("Scheduler SoT detection", () => {
    it("classifies all required SoT rows", () => {
      const states = SCHEDULER_SOT.map((s) => s.state);
      expect(states.join(" ")).toMatch(/Schedule definition/);
      expect(states.join(" ")).toMatch(/nextRun/);
      expect(states.join(" ")).toMatch(/occurrence/);
      expect(states.join(" ")).toMatch(/Scheduler history/);
      const history = SCHEDULER_SOT.find((s) => s.state.includes("Scheduler history"));
      expect(history?.sot).toBe("undefined");
    });

    it("inventory covers entry points, secrets, nextRun paths, risks", () => {
      expect(SCHEDULER_ENTRY_POINTS.length).toBeGreaterThanOrEqual(8);
      expect(SECRET_AUDIT.some((s) => s.key === "CRON_SECRET")).toBe(true);
      expect(SECRET_AUDIT.some((s) => s.key === "INTERNAL_API_SECRET")).toBe(true);
      expect(NEXT_RUN_AT_PATHS.length).toBeGreaterThanOrEqual(8);
      expect(RISK_REGISTER.some((r) => r.severity === "P0")).toBe(true);
      const snap = buildSchedulerAuditSnapshot();
      expect(snap.verdict.minuteProductionProven).toBe(false);
      expect(snap.productionEvidence.liveVercelCronHundredRuns).toBe(false);
    });
  });

  describe("CI artifacts", () => {
    it("writes required artifact files without failing main on existing P0s", () => {
      const dirs = [
        join("artifacts", "scheduler-audit-2-1"),
        join("/opt/cursor/artifacts", "scheduler-audit-2-1"),
      ];
      let snapshot = buildSchedulerAuditSnapshot();
      for (const dir of dirs) {
        const written = writeSchedulerAuditArtifacts(dir);
        snapshot = written.snapshot;
        expect(written.files.length).toBe(6);
        for (const name of [
          "scheduler-audit.json",
          "cron-inventory.json",
          "scheduler-secrets-audit.json",
          "next-run-at-paths.json",
          "scheduler-risk-register.json",
          "scheduler-phase-2-2-plan.md",
        ]) {
          expect(existsSync(join(dir, name))).toBe(true);
        }
      }
      // Regression gate: inventory must match vercel.json (prevent NEW silent drift)
      expect(snapshot.crons.find((c) => c.sourceFile === "vercel.json")?.schedule).toBe(
        JSON.parse(readFileSync("vercel.json", "utf8")).crons[0].schedule,
      );
      // Existing P0s are documented, not used as unconditional CI fail.
      expect(snapshot.risks.some((r) => r.severity === "P0")).toBe(true);
      expect(snapshot.verdict.phasePass).toBe(true);
    });
  });
});
