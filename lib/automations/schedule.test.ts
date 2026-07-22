import { describe, expect, it } from "vitest";

import {
  computeNextRunIso,
  DEFAULT_AUTOMATION_TIMEZONE,
  getZonedParts,
  isAutomationDue,
  presetToCron,
} from "./schedule";
import type { AutomationSchedule } from "./types";

describe("automation schedule (Asia/Tokyo)", () => {
  it("defaults timezone to Asia/Tokyo", () => {
    expect(DEFAULT_AUTOMATION_TIMEZONE).toBe("Asia/Tokyo");
  });

  it("computes daily cron from preset", () => {
    expect(presetToCron({ type: "daily", hour: 9, minute: 30 })).toBe("30 9 * * *");
  });

  it("computes next run in JST after local wall time passed", () => {
    const schedule: AutomationSchedule = {
      kind: "schedule",
      preset: { type: "daily", hour: 9, minute: 0 },
      cron: "0 9 * * *",
      timezone: "Asia/Tokyo",
      label: "毎日 9:00",
    };

    const from = new Date("2026-07-22T01:00:00.000Z");
    const next = computeNextRunIso(schedule, from);
    expect(next).toBeTruthy();
    const parts = getZonedParts(new Date(next!), "Asia/Tokyo");
    expect(parts.hour).toBe(9);
    expect(parts.minute).toBe(0);
  });

  it("handles month-end clamp for monthly preset", () => {
    const schedule: AutomationSchedule = {
      kind: "schedule",
      preset: { type: "monthly", dayOfMonth: 31, hour: 8, minute: 0 },
      cron: "0 8 31 * *",
      timezone: "Asia/Tokyo",
      label: "毎月31日",
    };

    const from = new Date("2026-02-01T00:00:00.000Z");
    const next = computeNextRunIso(schedule, from);
    expect(next).toBeTruthy();
    const parts = getZonedParts(new Date(next!), "Asia/Tokyo");
    expect(parts.day).toBeLessThanOrEqual(28);
  });

  it("does not fire when automation is disabled", () => {
    expect(
      isAutomationDue(
        {
          enabled: false,
          nextRun: new Date().toISOString(),
        },
        new Date(),
      ),
    ).toBe(false);
  });
});
