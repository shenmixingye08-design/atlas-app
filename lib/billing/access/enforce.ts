import "server-only";

import type { BillingFeatureId } from "../plans/types";
import {
  billingDenialResponse,
  evaluateBillingAiUsage,
  evaluateBillingAutomationTask,
  evaluateBillingExternalIntegration,
  evaluateBillingFeature,
  evaluateBillingSnsPost,
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

export async function requireBillingSnsPost(
  userId: string,
): Promise<Response | null> {
  const { denial } = await evaluateBillingSnsPost(userId);
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
