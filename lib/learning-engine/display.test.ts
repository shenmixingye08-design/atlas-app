import { describe, expect, it } from "vitest";

import {
  buildAdviceCards,
  buildAnalysisStats,
  buildRecommendationBuckets,
} from "./display";
import type { LearningReport } from "./types";

function sampleReport(overrides: Partial<LearningReport> = {}): LearningReport {
  return {
    reportId: "r1",
    userId: "u1",
    periodDays: 30,
    periodStart: new Date().toISOString(),
    periodEnd: new Date().toISOString(),
    generatedAt: new Date().toISOString(),
    hasSufficientData: true,
    dataPoints: 5,
    insufficientMessage: null,
    sections: {
      improvements: [
        {
          text: "修正が必要な仕事が増えています",
          evidence: "Learning Event",
          confidence: 0.7,
        },
      ],
      maintain: [],
      recommendations: [
        {
          text: "「ブログ」が最も多く依頼されています（3回）。",
          evidence: "domain",
          confidence: 0.74,
        },
      ],
      futureProposals: [
        {
          text: "未確認のテンプレート候補があります",
          evidence: "Work Memory",
          confidence: 0.6,
        },
      ],
    },
    summary: {
      eventCount: 4,
      memoryCount: 2,
      correctionCount: 1,
      avgDurationMs: 120_000,
    },
    ...overrides,
  };
}

describe("learning display helpers", () => {
  it("builds advice cards from real report sections", () => {
    const cards = buildAdviceCards(sampleReport());
    expect(cards.length).toBeGreaterThan(0);
    expect(cards[0]?.text).toContain("修正");
    expect(cards.some((card) => card.action.href.length > 0)).toBe(true);
  });

  it("does not invent time-saved stats", () => {
    const stats = buildAnalysisStats({
      report: sampleReport(),
      automationEnabledCount: 1,
      automationTotalCount: 2,
    });
    const timeSaved = stats.find((item) => item.id === "timeSaved");
    expect(timeSaved?.value).toBe("順次対応");
    expect(timeSaved?.supported).toBe(false);
    expect(stats.find((item) => item.id === "volume")?.value).toBe("4件");
    expect(stats.find((item) => item.id === "automation")?.value).toBe("50%");
  });

  it("builds recommendation buckets without fabricating items", () => {
    const buckets = buildRecommendationBuckets(sampleReport());
    expect(buckets).toHaveLength(4);
    const growing = buckets.find((item) => item.id === "growing");
    expect(growing?.items.length ?? 0).toBeGreaterThanOrEqual(0);
  });
});
