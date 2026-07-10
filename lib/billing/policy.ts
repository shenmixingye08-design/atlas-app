import {
  canUseGoogleIntegration,
  canUseHighQualityMode,
  checkAiUsageLimit,
  checkAutomationTaskLimit,
  checkExternalIntegrationLimit,
  checkFeatureAccess,
  checkSnsPostLimit,
} from "./plans/policy";
import type { BillingFeatureId, PlanCheckResult } from "./plans/types";
import { getUserSubscriptionView } from "./subscriptions/service";
import {
  enforcePaymentFailureGraceIfExpired,
  isAutomationSuspendedForUser,
} from "./subscriptions/lifecycle";
import { getUsageSnapshot } from "./usage/store";

/** Unified plan gate — use from API routes before expensive operations. */
export function evaluatePlanAccess(
  userId: string,
  feature: BillingFeatureId,
): PlanCheckResult {
  const subscription = getUserSubscriptionView(userId);
  return checkFeatureAccess(subscription.planId, feature);
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

  const subscription = getUserSubscriptionView(userId);
  return checkAutomationTaskLimit(subscription.planId, currentTaskCount);
}

export function evaluateExternalIntegrationAccess(
  userId: string,
  connectedCount: number,
): PlanCheckResult {
  const subscription = getUserSubscriptionView(userId);
  return checkExternalIntegrationLimit(subscription.planId, connectedCount);
}

export function evaluateAiUsageAccess(userId: string): PlanCheckResult {
  const subscription = getUserSubscriptionView(userId);
  const usage = getUsageSnapshot(userId);
  return checkAiUsageLimit(subscription.planId, usage);
}

export function evaluateSnsPostAccess(userId: string): PlanCheckResult {
  const subscription = getUserSubscriptionView(userId);
  const usage = getUsageSnapshot(userId);
  return checkSnsPostLimit(subscription.planId, usage);
}

export function userCanUseGoogleIntegration(userId: string): boolean {
  const subscription = getUserSubscriptionView(userId);
  return canUseGoogleIntegration(subscription.planId);
}

export function userCanUseHighQualityMode(userId: string): boolean {
  const subscription = getUserSubscriptionView(userId);
  return canUseHighQualityMode(subscription.planId);
}
