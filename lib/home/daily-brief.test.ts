import { describe, expect, it } from "vitest";

import { SEED_AUTOMATIONS } from "@/lib/automations/domain";

import {
  buildDailyBrief,
  computeYesterdayStats,
  getDailyTip,
  getGreetingPeriod,
} from "./daily-brief";

describe("daily brief", () => {
  it("returns morning greeting before noon", () => {
    expect(getGreetingPeriod(8)).toBe("morning");
    expect(getGreetingPeriod(14)).toBe("afternoon");
    expect(getGreetingPeriod(20)).toBe("evening");
  });

  it("reports empty yesterday when no completions", () => {
    const stats = computeYesterdayStats([], [], new Date("2026-07-09T10:00:00+09:00"));
    expect(stats.hasData).toBe(false);
    expect(stats.hoursSaved).toBe(0);
  });

  it("builds daily brief with headline and employees", () => {
    const now = new Date("2026-07-09T10:00:00");
    const brief = buildDailyBrief({
      automations: SEED_AUTOMATIONS,
      projects: [],
      now,
    });

    expect(brief.greetingPeriod).toBe("morning");
    expect(brief.headline.length).toBeGreaterThan(0);
    expect(brief.employees).toHaveLength(4);
    expect(brief.dailyTip).toBe(getDailyTip(now));
  });
});
