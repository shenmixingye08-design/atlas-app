import { describe, expect, it } from "vitest";

import { decideOwnerAccess } from "@/lib/auth/owner-access";

import { findForbiddenClaim } from "./claims";
import { defaultRevenueGoals, emptyMetrics } from "./defaults";
import { isDuplicateOfAny, jaccardSimilarity } from "./duplicate";
import { buildTemplateBatch } from "./generate";
import { buildRevenueInsights, scorePublishedItem } from "./insights";
import { canPublishNow } from "./publish-policy";
import { buildRevenueUtmUrl } from "./utm";
import type { RevenueContent } from "./types";

const goals = defaultRevenueGoals();

function sampleItem(partial: Partial<RevenueContent> = {}): RevenueContent {
  const now = new Date().toISOString();
  return {
    id: partial.id ?? "ra_1",
    campaign: "minervot_solo_acquisition_beta",
    status: "approved",
    kind: "pain_point",
    platform: "x",
    title: "title",
    hook: "hook",
    body: "body",
    cta: "cta",
    recommendedPlatform: "x",
    assumedTarget: goals.targetAudience,
    desiredAction: "LP",
    reason: "reason",
    video: null,
    utmUrl: "https://minervot.com/",
    scheduledAt: null,
    publishedAt: null,
    postUrl: null,
    xTweetId: null,
    idempotencyKey: "ra_pub_ra_1",
    attemptCount: 0,
    maxAttempts: 3,
    lastError: null,
    metrics: emptyMetrics(),
    metricSource: {
      impressions: "unknown",
      likes: "unknown",
      replies: "unknown",
      reposts: "unknown",
      linkClicks: "unknown",
      lpVisits: "unknown",
      signups: "unknown",
      paidConversions: "unknown",
      revenueYen: "unknown",
    },
    generationMode: "template",
    createdAt: now,
    updatedAt: now,
    generationId: "gen_1",
    ...partial,
  };
}

describe("revenue agent access", () => {
  it("denies missing user and non-owner email without leaking ids", () => {
    expect(decideOwnerAccess({ userId: null, email: "a@b.com" }).status).toBe(
      "unauthenticated",
    );
    expect(
      decideOwnerAccess({ userId: "user_1", email: "not-owner@example.com" })
        .status,
    ).toBe("forbidden");
  });
});

describe("claims and duplicates", () => {
  it("rejects fabricated proof and guaranteed-income copy", () => {
    expect(findForbiddenClaim("導入社数は100社です", goals)).toBeTruthy();
    expect(findForbiddenClaim("確実に稼げる副業", goals)).toBeTruthy();
    expect(
      findForbiddenClaim("毎日の定型作業を秘書に渡す話です", goals),
    ).toBeNull();
  });

  it("detects near-duplicate bodies", () => {
    const a = "毎日同じ資料作りが残っていませんか。MINERVOTは仕事の進め方を覚えます。";
    const b = "毎日同じ資料作りが残っていませんか。MINERVOTは仕事の進め方を覚えます！";
    expect(jaccardSimilarity(a, b)).toBeGreaterThan(0.62);
    expect(isDuplicateOfAny(b, [a])).toBe(true);
  });
});

describe("template generation", () => {
  it("creates at least 3 distinct drafts without fabricated metrics", () => {
    const items = buildTemplateBatch({
      goals,
      existingBodies: [],
      generationId: "gen_test",
    });
    expect(items.length).toBeGreaterThanOrEqual(3);
    const bodies = items.map((item) => item.body);
    for (let i = 0; i < bodies.length; i += 1) {
      expect(isDuplicateOfAny(bodies[i]!, bodies.filter((_, j) => j !== i))).toBe(
        false,
      );
      expect(findForbiddenClaim(bodies[i]!, goals)).toBeNull();
      expect(items[i]!.metrics.impressions).toBeNull();
      expect(items[i]!.status).toBe("pending_approval");
    }
  });
});

describe("utm and publish policy", () => {
  it("builds campaign UTMs", () => {
    const url = buildRevenueUtmUrl({
      lpUrl: "https://minervot.com/pricing",
      platform: "x",
      kind: "pain_point",
      contentId: "ra_abc",
    });
    expect(url).toContain("utm_source=x");
    expect(url).toContain("utm_medium=social");
    expect(url).toContain("utm_campaign=minervot_solo_acquisition_beta");
    expect(url).toContain("utm_content=ra_abc");
  });

  it("publishes only approved or due scheduled items", () => {
    expect(canPublishNow(sampleItem({ status: "pending_approval" }))).toBe(false);
    expect(canPublishNow(sampleItem({ status: "approved" }))).toBe(true);
    expect(
      canPublishNow(
        sampleItem({
          status: "scheduled",
          scheduledAt: "2099-01-01T00:00:00.000Z",
        }),
      ),
    ).toBe(false);
    expect(
      canPublishNow(sampleItem({ status: "approved", xTweetId: "123" })),
    ).toBe(false);
  });
});

describe("insights honesty", () => {
  it("does not treat unknown metrics as zero scores", () => {
    expect(scorePublishedItem(emptyMetrics())).toBeNull();
    const insights = buildRevenueInsights([
      sampleItem({ status: "published", metrics: emptyMetrics() }),
    ]);
    expect(insights.confidence).toBe("insufficient");
    expect(insights.lpVisitRate).toBeNull();
    expect(insights.disclaimer).toContain("サンプル不足");
    expect(insights.topPosts).toHaveLength(0);
  });

  it("uses only known numbers when ranking", () => {
    const insights = buildRevenueInsights([
      sampleItem({
        id: "a",
        status: "published",
        hook: "良いフック",
        metrics: { ...emptyMetrics(), likes: 4, lpVisits: 2 },
      }),
      sampleItem({
        id: "b",
        status: "published",
        hook: "弱いフック",
        metrics: { ...emptyMetrics(), likes: 1, lpVisits: 0 },
      }),
    ]);
    expect(insights.confidence).toBe("insufficient");
    expect(insights.topPosts[0]?.id).toBe("a");
    expect(insights.bottomPosts[0]?.id).toBe("b");
  });
});
