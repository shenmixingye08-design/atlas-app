import "server-only";

import { aiJobClaimKey, consumeAiJobQuota } from "@/lib/billing/usage/ai-job";
import { countBillableAutomations } from "@/lib/billing/usage/automation-inventory";

import { aiUsageLimitReachedMessage } from "../plans/policy";
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
  getBillingAccessSnapshot,
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
  const { denial } = await evaluateBillingAiUsage(userId);
  return denial ? billingDenialResponse(denial) : null;
}

function quotaDenialFromReserve(input: {
  used: number;
  limit: number;
  currentPlan: BillingDenial["currentPlan"];
  currentPlanName: string;
}): BillingDenial {
  return {
    kind: "limit",
    status: 429,
    reason: aiUsageLimitReachedMessage(input.limit),
    currentPlan: input.currentPlan,
    currentPlanName: input.currentPlanName,
    requiredPlan: null,
    requiredPlanName: null,
    upgradePath: BILLING_UPGRADE_PATH,
    used: input.used,
    limit: input.limit,
    remaining: Math.max(0, input.limit - input.used),
  };
}

/**
 * Atomic reserve immediately before any AI provider call.
 * Same claimKey is idempotent (retry / double-tap / queue retry).
 */
export async function consumeBillingAiJob(
  userId: string,
  claimKey: string,
): Promise<Response | null> {
  const snapshot = await getBillingAccessSnapshot(userId);
  if (snapshot.isOwner) return null;

  const reserved = await consumeAiJobQuota({ userId, claimKey });
  if (reserved.ok) return null;
  if (reserved.reason === "usage_unavailable") {
    return Response.json(
      {
        error: "usage_unavailable",
        message: "利用状況を確認できないため、AI作業を開始できませんでした。",
      },
      { status: 503 },
    );
  }
  return billingDenialResponse(
    quotaDenialFromReserve({
      used: reserved.used,
      limit: reserved.limit,
      currentPlan: snapshot.effectivePlanId,
      currentPlanName: snapshot.effectivePlanName,
    }),
  );
}

export async function requireAndConsumeAiJob(
  userId: string,
  surface: string,
  stableId: string,
): Promise<Response | null> {
  return consumeBillingAiJob(
    userId,
    aiJobClaimKey(surface, userId, stableId),
  );
}

export function billingAiJobClaimKey(
  surface: string,
  userId: string,
  stableId: string,
): string {
  return aiJobClaimKey(surface, userId, stableId);
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

export async function requireBillingAutomationTaskLive(
  userId: string,
): Promise<Response | null> {
  const currentTaskCount = await countBillableAutomations(userId);
  return requireBillingAutomationTask(userId, currentTaskCount);
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
  return null;
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
