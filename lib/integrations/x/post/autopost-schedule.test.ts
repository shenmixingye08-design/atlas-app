import { beforeEach, describe, expect, it } from "vitest";

import {
  computeDueSlots,
  computeNextScheduledFor,
  zonedWallTimeToDate,
} from "./autopost-schedule";
import {
  claimXAutoPostSlot,
  resetXAutoPostRunsMemory,
} from "./autopost-runs-store";
import { createDefaultXAutoPostSettings } from "./autopost-types";

function settings(overrides: Partial<ReturnType<typeof createDefaultXAutoPostSettings>>) {
  return { ...createDefaultXAutoPostSettings("user_1"), ...overrides };
}

describe("autopost schedule", () => {
  it("converts JST wall time to the correct UTC instant", () => {
    // 09:00 JST == 00:00 UTC the same day.
    const date = zonedWallTimeToDate("2026-07-20", "09:00", "Asia/Tokyo");
    expect(date?.toISOString()).toBe("2026-07-20T00:00:00.000Z");
  });

  it("returns a due slot when a daily post time has just passed (JST)", () => {
    const config = settings({
      enabled: true,
      frequency: "daily_1",
      postTimes: ["09:00"],
    });
    // 09:05 JST == 00:05 UTC.
    const now = new Date("2026-07-20T00:05:00.000Z");
    const due = computeDueSlots(config, now);
    expect(due).toHaveLength(1);
    expect(due[0]!.slotKey).toBe("2026-07-20T09:00");
  });

  it("does not return a slot before its scheduled time", () => {
    const config = settings({
      enabled: true,
      frequency: "daily_1",
      postTimes: ["09:00"],
    });
    // 08:00 JST == 23:00 UTC previous day.
    const now = new Date("2026-07-19T23:00:00.000Z");
    const due = computeDueSlots(config, now);
    expect(due).toHaveLength(0);
  });

  it("respects the catch-up window (skips very old slots)", () => {
    const config = settings({
      enabled: true,
      frequency: "daily_1",
      postTimes: ["09:00"],
    });
    // 15:00 JST, 6h after the 09:00 slot -> outside 120 min window.
    const now = new Date("2026-07-20T06:00:00.000Z");
    const due = computeDueSlots(config, now, 120);
    expect(due).toHaveLength(0);
  });

  it("only fires on selected weekdays for weekly frequency", () => {
    // 2026-07-20 is a Monday (weekday 1).
    const monday = new Date("2026-07-20T00:05:00.000Z");
    const active = settings({
      enabled: true,
      frequency: "weekly_1",
      daysOfWeek: [1],
      postTimes: ["09:00"],
    });
    expect(computeDueSlots(active, monday)).toHaveLength(1);

    const inactive = settings({
      enabled: true,
      frequency: "weekly_1",
      daysOfWeek: [2],
      postTimes: ["09:00"],
    });
    expect(computeDueSlots(inactive, monday)).toHaveLength(0);
  });

  it("computes the next upcoming scheduled time", () => {
    const config = settings({
      enabled: true,
      frequency: "daily_1",
      postTimes: ["09:00"],
    });
    const now = new Date("2026-07-20T02:00:00.000Z"); // 11:00 JST, past today's slot
    const next = computeNextScheduledFor(config, now);
    // Next is tomorrow 09:00 JST == 2026-07-21T00:00:00Z.
    expect(next).toBe("2026-07-21T00:00:00.000Z");
  });
});

describe("autopost idempotency", () => {
  beforeEach(() => {
    resetXAutoPostRunsMemory();
  });

  it("claims a slot once and rejects a duplicate claim", async () => {
    const first = await claimXAutoPostSlot({
      userId: "user_1",
      slotKey: "2026-07-20T09:00",
      scheduledFor: "2026-07-20T00:00:00.000Z",
      mode: "full_auto",
    });
    expect(first.claimed).toBe(true);

    const second = await claimXAutoPostSlot({
      userId: "user_1",
      slotKey: "2026-07-20T09:00",
      scheduledFor: "2026-07-20T00:00:00.000Z",
      mode: "full_auto",
    });
    expect(second.claimed).toBe(false);
  });

  it("isolates slots per user", async () => {
    const a = await claimXAutoPostSlot({
      userId: "user_a",
      slotKey: "2026-07-20T09:00",
      scheduledFor: null,
      mode: "approval",
    });
    const b = await claimXAutoPostSlot({
      userId: "user_b",
      slotKey: "2026-07-20T09:00",
      scheduledFor: null,
      mode: "approval",
    });
    expect(a.claimed).toBe(true);
    expect(b.claimed).toBe(true);
  });
});
