import { describe, expect, it } from "vitest";

import { SEED_AUTOMATIONS } from "@/lib/automations/domain";

import { buildMorningBrief, getMorningBriefIntro } from "./morning-brief";

describe("morning brief", () => {
  it("builds morning intro by time of day", () => {
    expect(getMorningBriefIntro("morning")).toContain("30秒");
    expect(getMorningBriefIntro("afternoon")).toContain("午後");
    expect(getMorningBriefIntro("evening")).toContain("残り");
  });

  it("includes date label and atlas sections", () => {
    const now = new Date("2026-07-09T10:00:00+09:00");
    const brief = buildMorningBrief({
      automations: SEED_AUTOMATIONS,
      projects: [],
      now,
    });

    expect(brief.dateLabel).toContain("2026");
    expect(brief.greetingPeriod).toBe("morning");
    expect(brief.atlas.estimatedHoursSaved).toBeGreaterThanOrEqual(0);
    expect(brief.employees).toHaveLength(4);
  });
});
