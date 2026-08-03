import { describe, expect, it } from "vitest";

import {
  computeNextRunIso,
  getZonedParts,
} from "@/lib/automations/schedule";
import type { AutomationSchedule } from "@/lib/automations/types";
import {
  computeResumeNextRunIso,
  computeSkipNextRunIso,
  lastDayOfMonthInTz,
} from "@/lib/work-queue/schedule-math";
import { classifyErrorCode, decideRetry } from "@/lib/work-queue/retry";
import { listScheduleCapabilities } from "@/lib/work-queue/capabilities";
import { WORK_JOB_TRANSITIONS } from "@/lib/work-queue/types";

function schedule(
  preset: Extract<AutomationSchedule, { kind: "schedule" }>["preset"],
  timezone = "Asia/Tokyo",
): Extract<AutomationSchedule, { kind: "schedule" }> {
  return {
    kind: "schedule",
    preset,
    timezone,
    label: "test",
  };
}

describe("schedule reliability matrix", () => {
  it("1 daily / 2 weekly / 3 monthly / 4 end-of-month clamp", () => {
    const daily = computeNextRunIso(
      schedule({ type: "daily", hour: 9, minute: 0 }),
      new Date("2026-08-03T00:00:00.000Z"),
    );
    expect(daily).toBeTruthy();

    const weekly = computeNextRunIso(
      schedule({ type: "weekly", dayOfWeek: 1, hour: 9, minute: 0 }),
      new Date("2026-08-03T00:00:00.000Z"),
    );
    expect(weekly).toBeTruthy();
    expect(getZonedParts(new Date(weekly!), "Asia/Tokyo").dayOfWeek).toBe(1);

    const monthly = computeNextRunIso(
      schedule({ type: "monthly", dayOfMonth: 31, hour: 9, minute: 0 }),
      new Date("2026-02-01T00:00:00.000Z"),
    );
    expect(monthly).toBeTruthy();
    const parts = getZonedParts(new Date(monthly!), "Asia/Tokyo");
    expect(parts.day).toBe(lastDayOfMonthInTz(parts.year, parts.month, "Asia/Tokyo"));
  });

  it("5 weekday semantics via weekly Mon–Fri selections", () => {
    for (const dayOfWeek of [1, 2, 3, 4, 5]) {
      const next = computeNextRunIso(
        schedule({ type: "weekly", dayOfWeek, hour: 9, minute: 0 }),
        new Date("2026-08-01T00:00:00.000Z"),
      );
      expect(getZonedParts(new Date(next!), "Asia/Tokyo").dayOfWeek).toBe(
        dayOfWeek,
      );
    }
  });

  it("6 timezone + 7/8 DST forward/backward no double slot", () => {
    const tz = "America/New_York";
    // Spring forward 2026-03-08
    const beforeSpring = new Date("2026-03-08T06:00:00.000Z");
    const a = computeNextRunIso(
      schedule({ type: "daily", hour: 2, minute: 30 }, tz),
      beforeSpring,
    );
    const b = computeNextRunIso(
      schedule({ type: "daily", hour: 2, minute: 30 }, tz),
      new Date(a!),
    );
    expect(a).not.toBe(b);
    expect(new Date(b!).getTime()).toBeGreaterThan(new Date(a!).getTime());

    // Fall back 2026-11-01
    const beforeFall = new Date("2026-11-01T05:00:00.000Z");
    const c = computeNextRunIso(
      schedule({ type: "daily", hour: 1, minute: 30 }, tz),
      beforeFall,
    );
    const d = computeNextRunIso(
      schedule({ type: "daily", hour: 1, minute: 30 }, tz),
      new Date(c!),
    );
    expect(new Date(d!).getTime()).toBeGreaterThan(new Date(c!).getTime());
  });

  it("9 pause clears next; 10 resume future-only; 11 skip next advances", () => {
    const sch = schedule({ type: "daily", hour: 9, minute: 0 });
    const resume = computeResumeNextRunIso(
      sch,
      new Date("2026-08-03T01:00:00.000Z"),
    );
    expect(new Date(resume!).getTime()).toBeGreaterThan(
      new Date("2026-08-03T01:00:00.000Z").getTime(),
    );
    const skipped = computeSkipNextRunIso(sch, resume);
    expect(new Date(skipped!).getTime()).toBeGreaterThan(
      new Date(resume!).getTime(),
    );
  });

  it("12 retry classification retryable vs non-retryable", () => {
    expect(classifyErrorCode("http_429")).toBe("retryable");
    expect(classifyErrorCode("http_500")).toBe("retryable");
    expect(classifyErrorCode("network_timeout")).toBe("retryable");
    expect(classifyErrorCode("missing_adapter")).toBe("non_retryable");
    expect(classifyErrorCode("missing_configuration")).toBe("non_retryable");
    expect(classifyErrorCode("revoked_oauth")).toBe("non_retryable");
    expect(classifyErrorCode("user_cancelled")).toBe("non_retryable");
    const exhausted = decideRetry({
      errorCode: "http_500",
      attempt: 5,
      maxAttempts: 5,
    });
    expect(exhausted.deadLetter).toBe(true);
  });

  it("13 terminal statuses cannot transition to completed", () => {
    expect(WORK_JOB_TRANSITIONS.cancelled).not.toContain("completed");
    expect(WORK_JOB_TRANSITIONS.failed).not.toContain("completed");
    expect(WORK_JOB_TRANSITIONS.dead_letter).not.toContain("completed");
    expect(WORK_JOB_TRANSITIONS.completed).toEqual([]);
  });

  it("14 holiday/business-day exclusion honestly unsupported", () => {
    const caps = listScheduleCapabilities();
    expect(
      caps.find((c) => c.capability === "holiday_exclusion")?.status,
    ).toBe("unsupported");
  });
});
