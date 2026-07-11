import "server-only";

import {
  canUseGoogleIntegration,
  canUseHighQualityMode,
  checkAiUsageLimit,
  checkAutomationTaskLimit,
  checkExternalIntegrationLimit,
  checkFeatureAccess,
  checkSnsPostLimit,
} from "./plans/policy";
import type { BillingFeatureId, PlanCheckResult, PlanId } from "./plans/types";
import {
  getUserSubscriptionView,
  isPaidCapableStatus,
} from "./subscriptions/service";
import {
  enforcePaymentFailureGraceIfExpired,
  isAutomationSuspendedForUser,
} from "./subscriptions/lifecycle";
import { getUsageSnapshot } from "./usage/store";

/**
 * Paid plan entitlements apply only while status is trialing or active.
 * Otherwise fall back to Free limits (existing Free policy — no new gates).
 */
function resolveEffectivePlanId(userId: string): PlanId {
  const subscription = getUserSubscriptionView(userId);
  if (subscription.planId === "free") return "free";
  if (isPaidCapableStatus(subscription.status)) return subscription.planId;
  return "free";
}

/** Unified plan gate — use from API routes before expensive operations. */
export function evaluatePlanAccess(
  userId: string,
  feature: BillingFeatureId,
): PlanCheckResult {
  return checkFeatureAccess(resolveEffectivePlanId(userId), feature);
}

export function evaluateAutomationTaskAccess(
  userId: string,
  currentTaskCount: number,
): PlanCheckResult {
  enforcePaymentFailureGraceIfExpired(userId);

  if (isAutomationSuspendedForUser(userId)) {
    const subscription = getUserSubscriptionView(userId);
    return {
      allowed: false,
      planId: subscription.planId,
      reason: "お支払い状況により自動化機能が停止されています",
    };
  }

  return checkAutomationTaskLimit(
    resolveEffectivePlanId(userId),
    currentTaskCount,
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

export function evaluateAiUsageAccess(userId: string): PlanCheckResult {
  const usage = getUsageSnapshot(userId);
  return checkAiUsageLimit(resolveEffectivePlanId(userId), usage);
}

export function evaluateSnsPostAccess(userId: string): PlanCheckResult {
  const usage = getUsageSnapshot(userId);
  return checkSnsPostLimit(resolveEffectivePlanId(userId), usage);
}

export function userCanUseGoogleIntegration(userId: string): boolean {
  return canUseGoogleIntegration(resolveEffectivePlanId(userId));
}

export function userCanUseHighQualityMode(userId: string): boolean {
  return canUseHighQualityMode(resolveEffectivePlanId(userId));
}
