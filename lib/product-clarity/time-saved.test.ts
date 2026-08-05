import { describe, expect, it } from "vitest";

import {
  buildTimeSavedBreakdown,
  formatMeasuredDuration,
  formatSavedAmount,
} from "./time-saved";

describe("time-saved clarity helpers", () => {
  it("never invents savings without a typical baseline", () => {
    const result = buildTimeSavedBreakdown({
      measuredSec: 42,
      typicalManualMinutes: null,
    });
    expect(result.savedMinutes).toBeNull();
    expect(result.measuredSec).toBe(42);
  });

  it("computes saved minutes from measured duration vs typical", () => {
    const result = buildTimeSavedBreakdown({
      measuredSec: 45,
      typicalManualMinutes: 15,
    });
    expect(result.savedMinutes).toBe(14.3);
    expect(formatSavedAmount(result.savedMinutes!)).toBe("14.3分");
  });

  it("floors savings at zero when slower than typical", () => {
    const result = buildTimeSavedBreakdown({
      measuredSec: 3600,
      typicalManualMinutes: 10,
    });
    expect(result.savedMinutes).toBe(0);
  });

  it("formats measured duration honestly", () => {
    expect(formatMeasuredDuration(42)).toBe("42秒");
    expect(formatMeasuredDuration(120)).toBe("2分");
    expect(formatMeasuredDuration(125)).toBe("2分5秒");
  });

  it("formats hours when savings exceed 60 minutes", () => {
    expect(formatSavedAmount(90)).toBe("1.5時間");
  });
});
