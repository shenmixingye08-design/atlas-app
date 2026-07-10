import { getPlanDefinition } from "./registry";
import type { BillingFeatureId, PlanCheckResult, PlanId } from "./types";
import type { UsageSnapshot } from "../usage/types";

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
    reason: `自動化タスクは${limit}件までです（${getPlanDefinition(planId).name}）`,
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
    reason: `今月のAI利用上限（${limit}回）に達しました`,
  };
}

export function checkSnsPostLimit(
  planId: PlanId,
  usage: UsageSnapshot,
): PlanCheckResult {
  const limit = getPlanDefinition(planId).limits.snsPostsMonthly;
  if (limit === 0) {
    return {
      allowed: false,
      planId,
      reason: `${getPlanDefinition(planId).name}プランではSNS投稿は利用できません`,
    };
  }
  if (usage.snsPosts < limit) return { allowed: true };

  return {
    allowed: false,
    planId,
    reason: `今月のSNS投稿上限（${limit}件）に達しました`,
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
