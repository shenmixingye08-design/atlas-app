import { describe, expect, it } from "vitest";

import { listPlanDefinitions } from "@/lib/billing/plans/registry";
import type { PlanId } from "@/lib/billing/plans/types";
import type { UsageLimitSummary, UsageMeter } from "@/lib/billing/usage/types";

import { findUsageBillingInconsistencies } from "./consistency";
import {
  formatOtherMetersRemain,
  formatPreUseHint,
  formatUpgradeLine,
  shouldShowUpgradeCta,
} from "./copy";
import { resolveUsageWarningLevel } from "./levels";
import { recommendUpgradeForMeter } from "./recommend";
import {
  shouldNotifyUsageThreshold,
  takeUsageThresholdNotices,
} from "./threshold-memory";
import { buildUsageAwarenessView } from "./view";

const catalog = listPlanDefinitions();

function meter(used: number, limit: number): UsageMeter {
  return { used, limit, remaining: Math.max(0, limit - used) };
}

function summary(input: {
  planId: PlanId;
  aiUsed: number;
  aiLimit?: number;
  month?: string;
}): UsageLimitSummary {
  const plan = catalog.find((row) => row.planId === input.planId)!;
  const aiLimit = input.aiLimit ?? plan.limits.aiUsageMonthly;
  return {
    planId: input.planId,
    month: input.month ?? "2026-08",
    aiRuns: meter(input.aiUsed, aiLimit),
    snsPosts: meter(0, plan.limits.xAutoPostsMonthly),
    xUrlPosts: meter(0, plan.limits.xUrlPostsMonthly),
    wordpressPosts: meter(0, plan.limits.wordpressPostsMonthly),
    automationTasks: meter(0, plan.limits.automationTasks),
    aiDetail: {
      today: { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
      month: { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
      allTime: { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
      byModel: {},
      byFeature: {},
    },
  };
}

describe("usage warning levels", () => {
  it("treats 0% used as NORMAL", () => {
    expect(resolveUsageWarningLevel({ used: 0, limit: 30 })).toBe("normal");
  });

  it("treats 69% used as NORMAL and 70% as NOTICE", () => {
    expect(resolveUsageWarningLevel({ used: 69, limit: 100 })).toBe("normal");
    expect(resolveUsageWarningLevel({ used: 70, limit: 100 })).toBe("notice");
  });

  it("treats 85% used as WARNING", () => {
    expect(resolveUsageWarningLevel({ used: 85, limit: 100 })).toBe("warning");
  });

  it("treats 95% used as CRITICAL", () => {
    expect(resolveUsageWarningLevel({ used: 95, limit: 100 })).toBe("critical");
  });

  it("treats remaining <= 1 as CRITICAL even when the rate is higher", () => {
    expect(resolveUsageWarningLevel({ used: 2, limit: 3 })).toBe("critical");
  });

  it("treats 100% as EXHAUSTED", () => {
    expect(resolveUsageWarningLevel({ used: 30, limit: 30 })).toBe("exhausted");
    expect(resolveUsageWarningLevel({ used: 31, limit: 30 })).toBe("exhausted");
  });

  it("does not warn for unlimited or unoffered limits", () => {
    expect(resolveUsageWarningLevel({ used: 999, limit: Number.POSITIVE_INFINITY })).toBe(
      "normal",
    );
    expect(resolveUsageWarningLevel({ used: 0, limit: 0 })).toBe("normal");
  });
});

describe("smart upgrade recommendation", () => {
  it("picks the smallest higher plan that increases the scarce meter", () => {
    const rec = recommendUpgradeForMeter({
      currentPlanId: "light",
      meterId: "aiRuns",
      plans: catalog,
    });
    expect(rec?.primary.planId).toBe("standard");
    expect(rec?.primary.nextLimit).toBe(
      catalog.find((plan) => plan.planId === "standard")!.limits.aiUsageMonthly,
    );
    expect(rec?.secondary?.planId).toBe("premium");
  });

  it("picks Standard for WordPress from Light because it is the smallest increase", () => {
    const rec = recommendUpgradeForMeter({
      currentPlanId: "light",
      meterId: "wordpressPosts",
      plans: catalog,
    });
    expect(rec?.primary.planId).toBe("standard");
    expect(rec?.primary.nextLimit).toBe(
      catalog.find((plan) => plan.planId === "standard")!.limits.wordpressPostsMonthly,
    );
    expect(rec?.secondary?.planId).toBe("premium");
  });

  it("does not recommend a plan when the meter does not increase", () => {
    const rec = recommendUpgradeForMeter({
      currentPlanId: "premium",
      meterId: "aiRuns",
      plans: catalog,
    });
    expect(rec).toBeNull();
  });

  it("does not invent Vision-only limits — image work uses AI runs", () => {
    const light = catalog.find((plan) => plan.planId === "light")!;
    const standard = catalog.find((plan) => plan.planId === "standard")!;
    expect(light.limits).not.toHaveProperty("visionMonthly");
    expect(standard.limits.aiUsageMonthly).toBeGreaterThan(light.limits.aiUsageMonthly);
  });
});

describe("threshold spam guard", () => {
  it("notifies once per crossed level and ignores repeats", () => {
    expect(
      shouldNotifyUsageThreshold({ current: "notice", lastNotified: null }),
    ).toBe(true);
    expect(
      shouldNotifyUsageThreshold({ current: "notice", lastNotified: "notice" }),
    ).toBe(false);
    expect(
      shouldNotifyUsageThreshold({ current: "warning", lastNotified: "notice" }),
    ).toBe(true);
    expect(
      shouldNotifyUsageThreshold({ current: "normal", lastNotified: null }),
    ).toBe(false);
  });

  it("records the notice so the same threshold does not fire again", () => {
    const storage = new Map<string, string>();
    const mem = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    };
    const item = { id: "aiRuns" as const, level: "notice" as const };
    const first = takeUsageThresholdNotices([item], { month: "2026-08", planId: "light" }, mem);
    const second = takeUsageThresholdNotices([item], { month: "2026-08", planId: "light" }, mem);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
  });
});

describe("usage awareness view", () => {
  it("builds remaining-first items from registry limits", () => {
    const view = buildUsageAwarenessView({
      usage: summary({ planId: "light", aiUsed: 21 }),
      catalog,
    });
    const ai = view.items.find((item) => item.id === "aiRuns")!;
    expect(ai.limit).toBe(30);
    expect(ai.remaining).toBe(9);
    expect(ai.level).toBe("notice");
    expect(ai.primaryUpgrade?.planId).toBe("standard");
    expect(formatPreUseHint(ai)).toContain("あと9回");
    expect(formatUpgradeLine(ai)).toContain("Standard");
    expect(formatUpgradeLine(ai)).toContain("100");
    expect(shouldShowUpgradeCta(ai.level)).toBe(false);
    expect(view.resetLabel).toBe("9月1日にリセットされます");
    expect(view.inconsistencies).toEqual([]);
  });

  it("shows exhausted copy, reset day, and other remaining meters", () => {
    const usage = summary({ planId: "standard", aiUsed: 100 });
    usage.snsPosts = meter(4, 30);
    const view = buildUsageAwarenessView({ usage, catalog });
    const ai = view.items.find((item) => item.id === "aiRuns")!;
    expect(ai.level).toBe("exhausted");
    expect(ai.resetLabel).toBe("9月1日にリセットされます");
    expect(shouldShowUpgradeCta(ai.level)).toBe(true);
    expect(formatOtherMetersRemain(view.items)).toContain("X自動投稿");
  });

  it("uses the new plan limit immediately after upgrade", () => {
    const before = buildUsageAwarenessView({
      usage: summary({ planId: "light", aiUsed: 21 }),
      catalog,
    });
    const after = buildUsageAwarenessView({
      usage: summary({ planId: "standard", aiUsed: 21 }),
      catalog,
    });
    expect(before.items[0].limit).toBe(30);
    expect(after.items[0].limit).toBe(100);
    expect(after.items[0].level).toBe("normal");
    expect(after.planId).toBe("standard");
  });

  it("does not mix subscribed plan with effective usage plan", () => {
    const view = buildUsageAwarenessView({
      usage: summary({ planId: "free", aiUsed: 1 }),
      catalog,
      subscribedPlanId: "standard",
    });
    expect(view.periodRightsDiffer).toBe(true);
    expect(view.planId).toBe("free");
    expect(view.items[0].limit).toBe(1);
  });
});

describe("billing consistency", () => {
  it("accepts registry-backed usage and flags a drifted meter", () => {
    const ok = summary({ planId: "light", aiUsed: 0 });
    expect(findUsageBillingInconsistencies({ usage: ok, catalog })).toEqual([]);

    const drifted = summary({ planId: "light", aiUsed: 0, aiLimit: 999 });
    expect(
      findUsageBillingInconsistencies({ usage: drifted, catalog }).some((row) =>
        row.startsWith("usage_limit_mismatch:aiRuns"),
      ),
    ).toBe(true);
  });

  it("keeps landing/catalog prices aligned with Stripe JPY expectations", () => {
    for (const plan of catalog) {
      expect(plan.monthlyPriceJpy).toBeGreaterThanOrEqual(0);
    }
    const usage = summary({ planId: "premium", aiUsed: 0 });
    expect(findUsageBillingInconsistencies({ usage, catalog })).toEqual([]);
  });
});
