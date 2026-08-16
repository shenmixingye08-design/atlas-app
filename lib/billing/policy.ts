import "server-only";

import {
  canUseGoogleIntegration,
  canUseHighQualityMode,
  checkAiExecutionLimit,
  checkAutomationTaskLimit,
  checkExternalIntegrationLimit,
  checkFeatureAccess,
  checkWordPressPublishLimit,
  checkXPostQuota,
} from "./plans/policy";
import type { BillingFeatureId, PlanCheckResult, PlanId } from "./plans/types";
import {
  getUserSubscriptionView,
  resolveEffectivePlanIdFromRecord,
  resolveUserSubscription,
} from "./subscriptions/service";
import {
  enforcePaymentFailureGraceIfExpired,
  isAutomationSuspendedForUser,
} from "./subscriptions/lifecycle";
import { getUserAiUsageBreakdown } from "./usage/meter";
import { countActiveAutomationTasks } from "./usage/automation-count";
import { pendingAiRunReservationCount } from "./usage/reservation";
import { getUsageSnapshot } from "./usage/store";
import { tweetContainsExternalUrl } from "./usage/x-url";

/**
 * Paid plan entitlements apply only while status is trialing or active.
 * Otherwise fall back to Free limits (existing Free policy — no new gates).
 */
export function resolveEffectivePlanId(userId: string): PlanId {
  return resolveEffectivePlanIdFromRecord(resolveUserSubscription(userId));
}

/** Unified plan gate — use from API routes before expensive operations. */
export function evaluatePlanAccess(
  userId: string,
  feature: BillingFeatureId,
): PlanCheckResult {
  return checkFeatureAccess(resolveEffectivePlanId(userId), feature);
}

export async function evaluateAutomationTaskAccess(
  userId: string,
  currentTaskCount: number,
): Promise<PlanCheckResult> {
  await enforcePaymentFailureGraceIfExpired(userId);

  if (isAutomationSuspendedForUser(userId)) {
    const subscription = getUserSubscriptionView(userId);
    return {
      allowed: false,
      planId: subscription.planId,
      reason: "お支払い状況により自動化機能が停止されています",
    };
  }

  void currentTaskCount;
  const liveCount = await countActiveAutomationTasks(userId);
  return checkAutomationTaskLimit(
    resolveEffectivePlanId(userId),
    liveCount,
  );
}

export function evaluateExternalIntegrationAccess(
  userId: string,
  connectedCount: number,
): PlanCheckResult {
  return checkExternalIntegrationLimit(
    resolveEffectivePlanId(userId),
    connectedCount,
  );
}

export function evaluateAiUsageAccess(
  userId: string,
  nextEstimatedCostUsd = 0,
): PlanCheckResult {
  const usage = getUsageSnapshot(userId);
  const prepaid = pendingAiRunReservationCount(userId);
  const adjusted = {
    ...usage,
    aiRuns: Math.max(0, usage.aiRuns - prepaid),
  };
  const monthCostUsd = getUserAiUsageBreakdown(userId).month.estimatedCostUsd;
  return checkAiExecutionLimit(
    resolveEffectivePlanId(userId),
    adjusted,
    monthCostUsd,
    nextEstimatedCostUsd,
  );
}

export function evaluateSnsPostAccess(
  userId: string,
  options: { text?: string; containsUrl?: boolean } = {},
): PlanCheckResult {
  const usage = getUsageSnapshot(userId);
  const containsUrl =
    options.containsUrl ??
    (typeof options.text === "string"
      ? tweetContainsExternalUrl(options.text)
      : false);
  return checkXPostQuota(resolveEffectivePlanId(userId), usage, containsUrl);
}

export function evaluateWordPressPublishAccess(userId: string): PlanCheckResult {
  const usage = getUsageSnapshot(userId);
  return checkWordPressPublishLimit(resolveEffectivePlanId(userId), usage);
}

export function userCanUseGoogleIntegration(userId: string): boolean {
  return canUseGoogleIntegration(resolveEffectivePlanId(userId));
}

export function userCanUseHighQualityMode(userId: string): boolean {
  return canUseHighQualityMode(resolveEffectivePlanId(userId));
}
