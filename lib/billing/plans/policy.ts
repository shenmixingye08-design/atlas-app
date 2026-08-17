import { getPlanDefinition } from "./registry";
import type { BillingFeatureId, PlanCheckResult, PlanId } from "./types";
import type { UsageSnapshot } from "../usage/types";

/** User-facing copy for both AI run and AI cost ceilings. Never leak USD. */
export const AI_USAGE_LIMIT_REACHED_MESSAGE =
  "今月のAI作業上限に達しました。翌月にリセットされます。";

export function aiUsageLimitReachedMessage(limit: number): string {
  return `今月のAI作業上限${limit}回に達しました。`;
}

export function automationTaskLimitReachedMessage(limit: number): string {
  return `現在のプランでは自動化を${limit}件まで作成できます。`;
}

export function planIncludesFeature(
  planId: PlanId,
  feature: BillingFeatureId,
): boolean {
  return getPlanDefinition(planId).limits.features.includes(feature);
}

export function checkFeatureAccess(
  planId: PlanId,
  feature: BillingFeatureId,
): PlanCheckResult {
  if (planIncludesFeature(planId, feature)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    planId,
    reason: `${getPlanDefinition(planId).name}プランではこの機能は利用できません`,
  };
}

export function checkAutomationTaskLimit(
  planId: PlanId,
  currentTaskCount: number,
): PlanCheckResult {
  const limit = getPlanDefinition(planId).limits.automationTasks;
  if (currentTaskCount < limit) return { allowed: true };

  return {
    allowed: false,
    planId,
    reason: automationTaskLimitReachedMessage(limit),
  };
}

export function checkExternalIntegrationLimit(
  planId: PlanId,
  connectedCount: number,
): PlanCheckResult {
  const limit = getPlanDefinition(planId).limits.externalIntegrations;
  if (connectedCount < limit) return { allowed: true };

  return {
    allowed: false,
    planId,
    reason: `外部連携は${limit}件までです（${getPlanDefinition(planId).name}）`,
  };
}

export function checkAiUsageLimit(
  planId: PlanId,
  usage: UsageSnapshot,
): PlanCheckResult {
  const limit = getPlanDefinition(planId).limits.aiUsageMonthly;
  if (usage.aiRuns < limit) return { allowed: true };

  return {
    allowed: false,
    planId,
    reason: aiUsageLimitReachedMessage(limit),
  };
}

export function checkAiCostBudgetLimit(
  planId: PlanId,
  monthEstimatedCostUsd: number,
  nextEstimatedCostUsd = 0,
): PlanCheckResult {
  const budget = getPlanDefinition(planId).limits.aiCostBudgetUsdMonthly;
  const current = Math.max(0, monthEstimatedCostUsd);
  const next = Math.max(0, nextEstimatedCostUsd);
  if (current >= budget) {
    return {
      allowed: false,
      planId,
      reason: AI_USAGE_LIMIT_REACHED_MESSAGE,
    };
  }
  if (current + next > budget) {
    return {
      allowed: false,
      planId,
      reason: AI_USAGE_LIMIT_REACHED_MESSAGE,
    };
  }
  return { allowed: true };
}

/**
 * Both the monthly run count and the USD cost budget must pass.
 * Fail-closed before any AI provider call.
 */
export function checkAiExecutionLimit(
  planId: PlanId,
  usage: UsageSnapshot,
  monthEstimatedCostUsd: number,
  nextEstimatedCostUsd = 0,
): PlanCheckResult {
  const count = checkAiUsageLimit(planId, usage);
  if (!count.allowed) return count;
  return checkAiCostBudgetLimit(planId, monthEstimatedCostUsd, nextEstimatedCostUsd);
}

export function checkSnsPostLimit(
  planId: PlanId,
  usage: UsageSnapshot,
): PlanCheckResult {
  const limit = getPlanDefinition(planId).limits.xAutoPostsMonthly;
  const planName = getPlanDefinition(planId).name;
  if (limit === 0) {
    return {
      allowed: false,
      planId,
      reason: `${planName}プランではX自動投稿は利用できません`,
    };
  }
  if (usage.snsPosts < limit) return { allowed: true };

  return {
    allowed: false,
    planId,
    reason: `今月のX自動投稿上限（${limit}件）に達しました`,
  };
}

export function checkXUrlPostLimit(
  planId: PlanId,
  usage: UsageSnapshot,
): PlanCheckResult {
  const limit = getPlanDefinition(planId).limits.xUrlPostsMonthly;
  const planName = getPlanDefinition(planId).name;
  if (limit === 0) {
    return {
      allowed: false,
      planId,
      reason: `${planName}プランではURL付きX投稿は利用できません`,
    };
  }
  if ((usage.xUrlPosts ?? 0) < limit) return { allowed: true };

  return {
    allowed: false,
    planId,
    reason: `今月のURL付きX投稿上限（${limit}件）に達しました`,
  };
}

export function checkXPostQuota(
  planId: PlanId,
  usage: UsageSnapshot,
  containsUrl: boolean,
): PlanCheckResult {
  const total = checkSnsPostLimit(planId, usage);
  if (!total.allowed) return total;
  if (!containsUrl) return { allowed: true };
  return checkXUrlPostLimit(planId, usage);
}

export function checkWordPressPublishLimit(
  planId: PlanId,
  usage: UsageSnapshot,
): PlanCheckResult {
  const limit = getPlanDefinition(planId).limits.wordpressPostsMonthly;
  const planName = getPlanDefinition(planId).name;
  if (limit === 0) {
    return {
      allowed: false,
      planId,
      reason: `${planName}プランではWordPress公開は利用できません`,
    };
  }
  if ((usage.wordpressPosts ?? 0) < limit) return { allowed: true };

  return {
    allowed: false,
    planId,
    reason: `今月のWordPress公開上限（${limit}件）に達しました`,
  };
}

export function canUseHighQualityMode(planId: PlanId): boolean {
  return getPlanDefinition(planId).limits.highQualityMode;
}

export function canUseGoogleIntegration(planId: PlanId): boolean {
  return planIncludesFeature(planId, "google_integration");
}

export function canUseEcoMode(planId: PlanId): boolean {
  return planIncludesFeature(planId, "eco_mode");
}
