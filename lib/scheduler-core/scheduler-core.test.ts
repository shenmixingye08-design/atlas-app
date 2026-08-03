import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetWorkQueueStoreForTests } from "@/lib/work-queue/store";

import {
  calculateNextRunAt,
  calculateNextRunAtIso,
  calculateSkipNextRunAtIso,
  calculateResumeNextRunAtIso,
} from "./calculate-next-run-at";
import { authorizeSchedulerTick } from "./auth";
import { runSchedulerCoreTick } from "./due-tick";
import { resetSchedulerCoreStoreForTests } from "./durable";
import { buildSchedulerHealthSnapshot } from "./health";
import { decideMisfire } from "./misfire";
import { buildManualOccurrenceKey, buildScheduleOccurrenceKey } from "./occurrence";
import {
  FORMAL_SCHEDULER_TICK_PATH,
  DEPRECATED_AUTOMATIONS_TICK_PATH,
} from "./types";

const authMock = vi.fn();
const checkAtlasOwnerMock = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
}));

vi.mock("@/lib/auth/require-atlas-owner", () => ({
  checkAtlasOwner: () => checkAtlasOwnerMock(),
}));

describe("scheduler-core unification", () => {
  beforeEach(async () => {
    authMock.mockResolvedValue({ userId: null });
    checkAtlasOwnerMock.mockResolvedValue(false);
    vi.stubEnv("ATLAS_WORK_QUEUE_FORCE_FILE", "true");
    vi.stubEnv("ATLAS_SCHEDULER_CORE_FORCE_FILE", "true");
    vi.stubEnv("VERCEL_ENV", "development");
    vi.stubEnv("SCHEDULER_CRON_SECRET", "scheduler-secret-value-32chars!!");
    vi.stubEnv("CRON_SECRET", "");
    const store = resetSchedulerCoreStoreForTests();
    await store.resetForTests();
    const wq = resetWorkQueueStoreForTests();
    await wq.resetForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    authMock.mockReset();
    checkAtlasOwnerMock.mockReset();
  });

  describe("auth", () => {
    it("accepts correct SCHEDULER_CRON_SECRET (timing-safe path)", async () => {
      const req = new Request(`https://example.com${FORMAL_SCHEDULER_TICK_PATH}`, {
        method: "POST",
        headers: { authorization: "Bearer scheduler-secret-value-32chars!!" },
      });
      await expect(authorizeSchedulerTick(req)).resolves.toMatchObject({
        ok: true,
        via: "scheduler_secret",
      });
    });

    it("fail-closes when secret missing", async () => {
      vi.stubEnv("SCHEDULER_CRON_SECRET", "");
      vi.stubEnv("CRON_SECRET", "");
      vi.stubEnv("VERCEL_ENV", "production");
      const req = new Request(`https://example.com${FORMAL_SCHEDULER_TICK_PATH}`, {
        method: "POST",
      });
      await expect(authorizeSchedulerTick(req)).resolves.toMatchObject({
        ok: false,
        status: 503,
        diagnosticCode: "scheduler_secret_missing",
      });
    });

    it("rejects secret mismatch", async () => {
      vi.stubEnv("VERCEL_ENV", "production");
      const req = new Request(`https://example.com${FORMAL_SCHEDULER_TICK_PATH}`, {
        method: "POST",
        headers: { authorization: "Bearer wrong-secret-value-xxxxxx" },
      });
      await expect(authorizeSchedulerTick(req)).resolves.toMatchObject({
        ok: false,
        status: 401,
        diagnosticCode: "scheduler_secret_mismatch",
      });
    });

    it("rejects GET on formal tick (method restriction)", async () => {
      const req = new Request(`https://example.com${FORMAL_SCHEDULER_TICK_PATH}`, {
        method: "GET",
        headers: { authorization: "Bearer scheduler-secret-value-32chars!!" },
      });
      await expect(authorizeSchedulerTick(req)).resolves.toMatchObject({
        ok: false,
        diagnosticCode: "scheduler_method_not_allowed",
      });
    });

    it("accepts CRON_SECRET compat", async () => {
      vi.stubEnv("SCHEDULER_CRON_SECRET", "");
      vi.stubEnv("CRON_SECRET", "compat-secret-value-32chars!!!!");
      const req = new Request(`https://example.com${FORMAL_SCHEDULER_TICK_PATH}`, {
        method: "POST",
        headers: { authorization: "Bearer compat-secret-value-32chars!!!!" },
      });
      await expect(authorizeSchedulerTick(req)).resolves.toMatchObject({
        ok: true,
        via: "cron_secret_compat",
      });
    });
  });

  describe("nextRunAt", () => {
    it("daily / weekly / monthly / month_end / weekdays / once", () => {
      const from = new Date("2026-08-03T10:00:00.000Z");
      expect(
        calculateNextRunAtIso({
          recurrence: { frequency: "daily", hour: 9, minute: 0 },
          timezone: "UTC",
          from,
        }),
      ).toBe("2026-08-04T09:00:00.000Z");

      expect(
        calculateNextRunAtIso({
          recurrence: {
            frequency: "weekly",
            hour: 9,
            minute: 0,
            daysOfWeek: [3],
          },
          timezone: "UTC",
          from: new Date("2026-08-03T00:00:00.000Z"),
        }),
      ).toBe("2026-08-05T09:00:00.000Z");

      expect(
        calculateNextRunAtIso({
          recurrence: {
            frequency: "monthly",
            hour: 9,
            minute: 0,
            dayOfMonth: 31,
          },
          timezone: "UTC",
          from: new Date("2024-01-31T12:00:00.000Z"),
        }),
      ).toBe("2024-02-29T09:00:00.000Z");

      expect(
        calculateNextRunAt({
          recurrence: { frequency: "month_end", hour: 9, minute: 0 },
          timezone: "UTC",
          from: new Date("2026-08-01T00:00:00.000Z"),
        })?.toISOString(),
      ).toBe("2026-08-31T09:00:00.000Z");

      expect(
        calculateNextRunAt({
          recurrence: { frequency: "weekdays", hour: 9, minute: 0 },
          timezone: "UTC",
          from: new Date("2026-08-07T10:00:00.000Z"), // Friday
        })?.toISOString(),
      ).toBe("2026-08-10T09:00:00.000Z"); // Monday

      expect(
        calculateNextRunAt({
          recurrence: { frequency: "once", runAt: "2020-01-01T00:00:00.000Z" },
          timezone: "UTC",
          from,
        }),
      ).toBeNull();
    });

    it("timezone Asia/Tokyo + DST NY/London", () => {
      const tokyo = calculateNextRunAt({
        recurrence: { frequency: "daily", hour: 9, minute: 0 },
        timezone: "Asia/Tokyo",
        from: new Date("2026-08-03T00:30:00.000Z"),
      });
      expect(tokyo?.toISOString()).toBe("2026-08-04T00:00:00.000Z");

      const ny = calculateNextRunAt({
        recurrence: { frequency: "daily", hour: 2, minute: 30 },
        timezone: "America/New_York",
        from: new Date("2026-03-08T06:30:00.000Z"),
      });
      expect(ny).toBeInstanceOf(Date);
      expect(ny!.getTime()).toBeGreaterThan(Date.parse("2026-03-08T06:30:00.000Z"));

      const london = calculateNextRunAt({
        recurrence: { frequency: "daily", hour: 1, minute: 30 },
        timezone: "Europe/London",
        from: new Date("2026-10-25T01:30:00.000Z"),
      });
      expect(london!.getTime()).toBeGreaterThan(Date.parse("2026-10-25T01:30:00.000Z"));
    });

    it("pause/resume/skip helpers", () => {
      const schedule = {
        kind: "schedule" as const,
        preset: { type: "daily" as const, hour: 9, minute: 0 },
        timezone: "UTC",
        label: "daily",
      };
      expect(
        calculateResumeNextRunAtIso(schedule, new Date("2026-08-03T10:00:00.000Z")),
      ).toBe("2026-08-04T09:00:00.000Z");
      expect(
        calculateSkipNextRunAtIso(schedule, "2026-08-04T09:00:00.000Z"),
      ).toBe("2026-08-05T09:00:00.000Z");
    });
  });

  describe("due tick / duplicate / outbox", () => {
    it("due 0 returns succeeded with zeros", async () => {
      const result = await runSchedulerCoreTick({
        skipIndexSync: true,
        skipWorkerDrain: true,
      });
      expect(result.schedulerStatus).toBe("succeeded");
      expect(result.dueCount).toBe(0);
      expect(result.occurrenceCreatedCount).toBe(0);
    });

    it("due 1 creates occurrence+job+outbox and advances nextRun via outbox", async () => {
      const core = resetSchedulerCoreStoreForTests();
      await core.resetForTests();
      const { serverAutomationRepository } = await import(
        "@/lib/automations/repositories/server-automation-repository"
      );
      const created = await serverAutomationRepository.create({
        name: "test",
        description: "",
        schedule: {
          kind: "schedule",
          preset: { type: "daily", hour: 9, minute: 0 },
          timezone: "UTC",
          label: "daily",
        },
        workflow: { assignment: "x" },
        enabled: true,
        executionMode: "standard",
        userId: "owner-1",
      });
      await serverAutomationRepository.update(created.id, {
        nextRun: "2020-01-01T09:00:00.000Z",
      });
      await core.upsertSchedule({
        automationId: created.id,
        ownerId: "owner-1",
        environment: "test",
        enabled: true,
        paused: false,
        deletedAt: null,
        nextRunAt: "2020-01-01T09:00:00.000Z",
        timezone: "UTC",
        endAt: null,
        misfirePolicy: "run_once_immediately",
        name: "test",
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });

      const first = await runSchedulerCoreTick({
        skipIndexSync: true,
        skipWorkerDrain: true,
        now: new Date("2020-01-01T09:05:00.000Z"),
      });
      expect(first.occurrenceCreatedCount).toBe(1);
      expect(first.outboxCreatedCount).toBe(1);
      expect(first.nextRunUpdatedCount).toBeGreaterThanOrEqual(1);

      const second = await runSchedulerCoreTick({
        skipIndexSync: true,
        skipWorkerDrain: true,
        now: new Date("2020-01-01T09:05:00.000Z"),
      });
      expect(second.occurrenceCreatedCount).toBe(0);
    });

    it("duplicate tick same occurrence does not create two jobs", async () => {
      const core = resetSchedulerCoreStoreForTests();
      await core.resetForTests();
      const { serverAutomationRepository } = await import(
        "@/lib/automations/repositories/server-automation-repository"
      );
      const created = await serverAutomationRepository.create({
        name: "dup",
        description: "",
        schedule: {
          kind: "schedule",
          preset: { type: "daily", hour: 9, minute: 0 },
          timezone: "UTC",
          label: "daily",
        },
        workflow: { assignment: "x" },
        enabled: true,
        executionMode: "standard",
        userId: "owner-dup",
      });
      await serverAutomationRepository.update(created.id, {
        nextRun: "2020-01-01T09:00:00.000Z",
      });
      const row = {
        automationId: created.id,
        ownerId: "owner-dup",
        environment: "test" as const,
        enabled: true,
        paused: false,
        deletedAt: null,
        nextRunAt: "2020-01-01T09:00:00.000Z",
        timezone: "UTC",
        endAt: null,
        misfirePolicy: "run_once_immediately" as const,
        name: "dup",
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      await core.upsertSchedule(row);

      const a = await runSchedulerCoreTick({
        skipIndexSync: true,
        skipWorkerDrain: true,
        now: new Date("2020-01-01T09:05:00.000Z"),
      });
      // Force same nextRun again to simulate retry before advance visible
      await core.upsertSchedule({
        ...row,
        nextRunAt: "2020-01-01T09:00:00.000Z",
      });
      await serverAutomationRepository.update(created.id, {
        nextRun: "2020-01-01T09:00:00.000Z",
      });
      const b = await runSchedulerCoreTick({
        skipIndexSync: true,
        skipWorkerDrain: true,
        now: new Date("2020-01-01T09:05:00.000Z"),
      });
      expect(a.occurrenceCreatedCount).toBe(1);
      expect(b.occurrenceCreatedCount).toBe(0);
      expect(b.duplicateSkippedCount).toBe(1);
    });

    it("misfire skip_missed advances without enqueue", async () => {
      expect(
        decideMisfire({
          policy: "skip_missed",
          scheduledAt: new Date("2020-01-01T00:00:00.000Z"),
          now: new Date("2020-01-02T00:00:00.000Z"),
        }).action,
      ).toBe("skip_missed");
      expect(
        decideMisfire({
          policy: "run_once_immediately",
          scheduledAt: new Date("2020-01-01T00:00:00.000Z"),
          now: new Date("2020-01-02T00:00:00.000Z"),
        }).action,
      ).toBe("enqueue");
    });

    it("manual occurrence keys are namespaced", () => {
      const scheduled = buildScheduleOccurrenceKey({
        automationId: "a1",
        scheduledAt: "2026-08-03T09:00:00.000Z",
        timezone: "UTC",
      });
      const manual = buildManualOccurrenceKey({ automationId: "a1" });
      expect(scheduled.startsWith("occ:")).toBe(true);
      expect(manual.startsWith("manual:")).toBe(true);
      expect(manual).not.toBe(scheduled);
    });
  });

  describe("preview / health / paths", () => {
    it("blocks Preview unless explicitly allowed", async () => {
      vi.stubEnv("VERCEL_ENV", "preview");
      vi.stubEnv("SCHEDULER_ALLOW_PREVIEW_TICK", "");
      const result = await runSchedulerCoreTick({ skipWorkerDrain: true });
      expect(result.schedulerStatus).toBe("skipped");
      expect(result.errorCode).toBe("scheduler_preview_blocked");
    });

    it("health does not expose secrets", async () => {
      const snap = await buildSchedulerHealthSnapshot();
      expect(snap.formalPath).toBe(FORMAL_SCHEDULER_TICK_PATH);
      expect(JSON.stringify(snap)).not.toContain("scheduler-secret-value");
      expect(snap.configured).toBe(true);
    });

    it("documents formal vs deprecated paths", () => {
      expect(FORMAL_SCHEDULER_TICK_PATH).toBe("/api/internal/scheduler/tick");
      expect(DEPRECATED_AUTOMATIONS_TICK_PATH).toBe("/api/automations/tick");
    });
  });
});
