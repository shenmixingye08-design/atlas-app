import "server-only";

import type { BillingFeatureId } from "../plans/types";
import {
  BILLING_UPGRADE_PATH,
  billingDenialResponse,
  evaluateBillingAiUsage,
  evaluateBillingAutomationTask,
  evaluateBillingExternalIntegration,
  evaluateBillingFeature,
  evaluateBillingSnsPost,
  evaluateBillingWordPressPublish,
  resolveBillingFeatureForAssignment,
  type BillingDenial,
} from "./snapshot";

export async function requireBillingFeature(
  userId: string,
  feature: BillingFeatureId,
): Promise<Response | null> {
  const { denial } = await evaluateBillingFeature(userId, feature);
  return denial ? billingDenialResponse(denial) : null;
}

export async function requireBillingAiUsage(
  userId: string,
): Promise<Response | null> {
  const { denial, snapshot } = await evaluateBillingAiUsage(userId);
  if (denial) return billingDenialResponse(denial);
  if (snapshot.isOwner) return null;

  const { getPlanDefinition } = await import("../plans/registry");
  const { tryConsumeAiRunQuota } = await import("../usage/store");
  const { pushAiRunReservation } = await import("../usage/reservation");
  const claimKey = `gate:${userId}:${crypto.randomUUID()}`;
  const consumed = tryConsumeAiRunQuota({
    userId,
    claimKey,
    limit: getPlanDefinition(snapshot.effectivePlanId).limits.aiUsageMonthly,
  });
  if (!consumed.allowed) {
    const again = await evaluateBillingAiUsage(userId);
    return again.denial
      ? billingDenialResponse(again.denial)
      : billingDenialResponse({
          kind: "limit",
          status: 429,
          reason: "今月のAI利用上限に達しました。翌月にリセットされます。",
          currentPlan: snapshot.effectivePlanId,
          currentPlanName: snapshot.effectivePlanName,
          requiredPlan: null,
          requiredPlanName: null,
          upgradePath: BILLING_UPGRADE_PATH,
        });
  }
  if (consumed.incremented) {
    pushAiRunReservation(userId, { claimKey, incremented: true });
  }
  return null;
}

export async function requireBillingSnsPost(
  userId: string,
  options: { text?: string; containsUrl?: boolean } = {},
): Promise<Response | null> {
  const { denial } = await evaluateBillingSnsPost(userId, options);
  return denial ? billingDenialResponse(denial) : null;
}

export async function requireBillingWordPressPublish(
  userId: string,
): Promise<Response | null> {
  const { denial } = await evaluateBillingWordPressPublish(userId);
  return denial ? billingDenialResponse(denial) : null;
}

export async function requireBillingAutomationTask(
  userId: string,
  currentTaskCount: number,
): Promise<Response | null> {
  const { denial } = await evaluateBillingAutomationTask(
    userId,
    currentTaskCount,
  );
  return denial ? billingDenialResponse(denial) : null;
}

export async function requireBillingExternalIntegration(
  userId: string,
  connectedCount: number,
): Promise<Response | null> {
  const { denial } = await evaluateBillingExternalIntegration(
    userId,
    connectedCount,
  );
  return denial ? billingDenialResponse(denial) : null;
}

export async function requireBillingForAssignment(
  userId: string,
  input: {
    assignment: string;
    metadata?: Readonly<Record<string, unknown>>;
  },
): Promise<Response | null> {
  const feature = resolveBillingFeatureForAssignment(input);
  const featureDenied = await requireBillingFeature(userId, feature);
  if (featureDenied) return featureDenied;
  return requireBillingAiUsage(userId);
}

export async function getBillingFeatureDenial(
  userId: string,
  feature: BillingFeatureId,
): Promise<BillingDenial | null> {
  const { denial } = await evaluateBillingFeature(userId, feature);
  return denial;
}

export {
  getBillingAccessSnapshot,
  resolveBillingFeatureForAssignment,
  billingDenialToJson,
  type BillingAccessSnapshot,
  type BillingDenial,
} from "./snapshot";
