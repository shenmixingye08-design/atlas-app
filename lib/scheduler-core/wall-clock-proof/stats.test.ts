import { describe, expect, it } from "vitest";

import { percentile, rate, summarizeDelays } from "./stats";

describe("wall-clock proof stats helpers", () => {
  it("computes percentiles and rates", () => {
    const s = summarizeDelays([10, 20, 30, 40, 50]);
    expect(s.count).toBe(5);
    expect(s.mean).toBe(30);
    expect(s.median).toBe(30);
    expect(percentile([1, 2, 3, 4, 100], 95)).toBe(100);
    expect(rate(99, 100)).toBe(0.99);
    expect(rate(1, 0)).toBe(0);
  });
});
