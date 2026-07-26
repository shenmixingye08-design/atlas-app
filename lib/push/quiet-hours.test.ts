import { describe, expect, it } from "vitest";

import { isInQuietHours, isSuppressedByQuietHours } from "./quiet-hours";

function atTokyo(hours: number, minutes: number): Date {
  // Construct a UTC instant that is the given wall-clock time in Asia/Tokyo.
  const utc = Date.UTC(2026, 6, 26, hours - 9, minutes, 0);
  return new Date(utc);
}

describe("quiet hours (JST)", () => {
  it("returns false when bounds are empty", () => {
    expect(
      isInQuietHours({ quietHoursStart: null, quietHoursEnd: null }, atTokyo(23, 0)),
    ).toBe(false);
  });

  it("handles same-day range", () => {
    const prefs = { quietHoursStart: "13:00", quietHoursEnd: "15:00" };
    expect(isInQuietHours(prefs, atTokyo(14, 0))).toBe(true);
    expect(isInQuietHours(prefs, atTokyo(12, 59))).toBe(false);
    expect(isInQuietHours(prefs, atTokyo(15, 0))).toBe(false);
  });

  it("handles overnight range (22:00–07:00)", () => {
    const prefs = { quietHoursStart: "22:00", quietHoursEnd: "07:00" };
    expect(isInQuietHours(prefs, atTokyo(23, 30))).toBe(true);
    expect(isInQuietHours(prefs, atTokyo(3, 0))).toBe(true);
    expect(isInQuietHours(prefs, atTokyo(12, 0))).toBe(false);
    expect(isInQuietHours(prefs, atTokyo(21, 59))).toBe(false);
  });

  it("lets critical severity bypass quiet hours", () => {
    const prefs = { quietHoursStart: "22:00", quietHoursEnd: "07:00" };
    expect(
      isSuppressedByQuietHours({
        prefs,
        severity: "critical",
        now: atTokyo(23, 0),
      }),
    ).toBe(false);
    expect(
      isSuppressedByQuietHours({
        prefs,
        severity: "important",
        now: atTokyo(23, 0),
      }),
    ).toBe(true);
  });
});
