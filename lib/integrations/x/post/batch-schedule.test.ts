import { describe, expect, it } from "vitest";

import { zonedWallTimeToDate } from "./autopost-schedule";
import {
  distributeBatchSchedule,
  enumerateBatchSlots,
  parseBatchDateKey,
  parseBatchPostTime,
  resolveBatchTimezone,
} from "./batch-schedule";

describe("X post batch schedule", () => {
  it("defaults invalid timezone to Asia/Tokyo", () => {
    expect(resolveBatchTimezone("")).toBe("Asia/Tokyo");
    expect(resolveBatchTimezone("Not/AZone")).toBe("Asia/Tokyo");
    expect(resolveBatchTimezone("UTC")).toBe("UTC");
  });

  it("converts Asia/Tokyo wall time to UTC", () => {
    const date = zonedWallTimeToDate("2026-08-24", "10:00", "Asia/Tokyo");
    expect(date?.toISOString()).toBe("2026-08-24T01:00:00.000Z");
  });

  it("converts UTC wall time without shifting the day", () => {
    const date = zonedWallTimeToDate("2026-08-24", "10:00", "UTC");
    expect(date?.toISOString()).toBe("2026-08-24T10:00:00.000Z");
  });

  it("distributes unique weekdays without duplicate instants", () => {
    const slots = distributeBatchSchedule({
      startDate: "2026-08-24",
      endDate: "2026-09-20",
      daysOfWeek: [1, 3, 5],
      postTime: "10:00",
      timezone: "Asia/Tokyo",
      count: 7,
    });
    expect(slots).toHaveLength(7);
    const instants = slots.map((slot) => slot.scheduledFor);
    expect(new Set(instants).size).toBe(7);
    expect(slots.every((slot) => [1, 3, 5].includes(slot.weekday))).toBe(true);
  });

  it("skips occupied instants for the same account", () => {
    const first = distributeBatchSchedule({
      startDate: "2026-08-24",
      endDate: "2026-08-31",
      daysOfWeek: [1],
      postTime: "10:00",
      timezone: "Asia/Tokyo",
      count: 1,
    });
    expect(first[0]).toBeTruthy();
    const second = distributeBatchSchedule({
      startDate: "2026-08-24",
      endDate: "2026-09-30",
      daysOfWeek: [1],
      postTime: "10:00",
      timezone: "Asia/Tokyo",
      count: 1,
      occupiedUtc: new Set([first[0]!.scheduledFor]),
    });
    expect(second[0]?.scheduledFor).not.toBe(first[0]!.scheduledFor);
  });

  it("continues past endDate when the window is too small", () => {
    const slots = distributeBatchSchedule({
      startDate: "2026-08-24",
      endDate: "2026-08-24",
      daysOfWeek: [1],
      postTime: "09:00",
      timezone: "Asia/Tokyo",
      count: 3,
    });
    expect(slots).toHaveLength(3);
    expect(new Set(slots.map((slot) => slot.scheduledFor)).size).toBe(3);
  });

  it("rejects invalid date and time", () => {
    expect(parseBatchDateKey("2026-13-40")).toBeNull();
    expect(parseBatchPostTime("25:00")).toBeNull();
    expect(enumerateBatchSlots({
      startDate: "2026-08-24",
      endDate: "2026-08-20",
      daysOfWeek: [1],
      postTime: "10:00",
      timezone: "Asia/Tokyo",
      count: 3,
    })).toEqual([]);
  });
});
