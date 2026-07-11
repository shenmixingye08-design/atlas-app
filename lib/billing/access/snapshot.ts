import "server-only";

import { getClerkUserPrimaryEmail } from "@/lib/auth/get-clerk-user-email";
import { isAtlasOwnerEmail } from "@/lib/auth/is-atlas-owner";
import { isAtlasBetaUserEmail } from "@/lib/feature-flags/access";
import { siteConfig } from "@/lib/config/site";

import { getPlanDefinition, listPlanDefinitions } from "../plans/registry";
import type { BillingFeatureId, PlanId } from "../plans/types";
import { resolveUserSubscriptionDurable } from "../subscriptions/store";
import {
  getUserSubscriptionView,
  isPaidCapableStatus,
} from "../subscriptions/service";
import type { SubscriptionStatus } from "../subscriptions/types";
import { getUsageSnapshot } from "../usage/store";
import {
  evaluateAiUsageAccess,
  evaluateAutomationTaskAccess,
  evaluateExternalIntegrationAccess,
  evaluatePlanAccess,
  evaluateSnsPostAccess,
} from "../policy";

export const BILLING_UPGRADE_PATH = siteConfig.billingSettingsPath;

export type BillingAccessSnapshot = {
  userId: string;
  email: string | null;
  isOwner: boolean;
  isBetaUser: boolean;
  /** Stripe/Clerk stored plan (may be paid while status is not capable). */
  subscribedPlanId: PlanId;
  subscribedPlanName: string;
  /** Plan used for entitlement checks after status rules. */
  effectivePlanId: PlanId;
  effectivePlanName: string;
  status: SubscriptionStatus;
  isTrialing: boolean;
  isPaidCapable: boolean;
  isPaymentPastDue: boolean;
  isCancelAtPeriodEnd: boolean;
  automationsSuspended: boolean;
};

export function getMinimumPlanForFeature(feature: BillingFeatureId): PlanId {
  for (const plan of listPlanDefinitions()) {
    if (plan.limits.features.includes(feature)) {
      return plan.planId;
    }
  }
  return "premium";
}

export async function getBillingAccessSnapshot(
  userId: string,
): Promise<BillingAccessSnapshot> {
  await resolveUserSubscriptionDurable(userId);
  const view = getUserSubscriptionView(userId);
  const email = await getClerkUserPrimaryEmail(userId);
  const effectivePlanId =
    view.planId === "free"
      ? "free"
      : isPaidCapableStatus(view.status)
        ? view.planId
        : "free";

  return {
    userId,
    email,
    isOwner: isAtlasOwnerEmail(email),
    isBetaUser: isAtlasBetaUserEmail(email),
    subscribedPlanId: view.planId,
    subscribedPlanName: view.planName,
    effectivePlanId,
    effectivePlanName: getPlanDefinition(effectivePlanId).name,
    status: view.status,
    isTrialing: view.status === "trialing",
    isPaidCapable: isPaidCapableStatus(view.status),
    isPaymentPastDue: view.status === "past_due" || view.status === "unpaid",
    isCancelAtPeriodEnd: view.cancelAtPeriodEnd,
    automationsSuspended: Boolean(view.automationsSuspended),
  };
}

export type BillingDenial = {
  kind: "plan" | "limit";
  status: 402 | 403 | 429;
  reason: string;
  currentPlan: PlanId;
  currentPlanName: string;
  requiredPlan: PlanId | null;
  requiredPlanName: string | null;
  upgradePath: string;
};

/**
 * Owners bypass plan gates for operations (ATLAS_OWNER_EMAILS).
 * Beta users do not bypass billing — only feature flags.
 */
export async function evaluateBillingFeature(
  userId: string,
  feature: BillingFeatureId,
): Promise<{ snapshot: BillingAccessSnapshot; denial: BillingDenial | null }> {
  const snapshot = await getBillingAccessSnapshot(userId);
  if (snapshot.isOwner) {
    return { snapshot, denial: null };
  }

  const check = evaluatePlanAccess(userId, feature);
  const requiredPlan = getMinimumPlanForFeature(feature);
  if (check.allowed) {
    return { snapshot, denial: null };
  }

  const planName = getPlanDefinition(requiredPlan).name;
  const reason = `この機能は${planName}プラン以上でご利用いただけます（現在: ${snapshot.effectivePlanName}）`;

  return {
    snapshot,
    denial: {
      kind: "plan",
      status: 403,
      reason,
      currentPlan: snapshot.effectivePlanId,
      currentPlanName: snapshot.effectivePlanName,
      requiredPlan,
      requiredPlanName: planName,
      upgradePath: BILLING_UPGRADE_PATH,
    },
  };
}

export async function evaluateBillingAiUsage(
  userId: string,
): Promise<{ snapshot: BillingAccessSnapshot; denial: BillingDenial | null }> {
  const snapshot = await getBillingAccessSnapshot(userId);
  if (snapshot.isOwner) return { snapshot, denial: null };

  // Touch usage so limit uses hydrated subscription plan
  void getUsageSnapshot(userId);
  const check = evaluateAiUsageAccess(userId);
  if (check.allowed) return { snapshot, denial: null };

  return {
    snapshot,
    denial: {
      kind: "limit",
      status: 429,
      reason: check.reason,
      currentPlan: snapshot.effectivePlanId,
      currentPlanName: snapshot.effectivePlanName,
      requiredPlan: null,
      requiredPlanName: null,
      upgradePath: BILLING_UPGRADE_PATH,
    },
  };
}

export async function evaluateBillingSnsPost(
  userId: string,
): Promise<{ snapshot: BillingAccessSnapshot; denial: BillingDenial | null }> {
  const snapshot = await getBillingAccessSnapshot(userId);
  if (snapshot.isOwner) return { snapshot, denial: null };
  const check = evaluateSnsPostAccess(userId);
  if (check.allowed) return { snapshot, denial: null };
  const needsPlan = check.reason.includes("利用できません");
  return {
    snapshot,
    denial: {
      kind: needsPlan ? "plan" : "limit",
      status: needsPlan ? 403 : 429,
      reason: check.reason,
      currentPlan: snapshot.effectivePlanId,
      currentPlanName: snapshot.effectivePlanName,
      requiredPlan: needsPlan ? "light" : null,
      requiredPlanName: needsPlan ? getPlanDefinition("light").name : null,
      upgradePath: BILLING_UPGRADE_PATH,
    },
  };
}

export async function evaluateBillingAutomationTask(
  userId: string,
  currentTaskCount: number,
): Promise<{ snapshot: BillingAccessSnapshot; denial: BillingDenial | null }> {
  const snapshot = await getBillingAccessSnapshot(userId);
  if (snapshot.isOwner) return { snapshot, denial: null };
  const check = evaluateAutomationTaskAccess(userId, currentTaskCount);
  if (check.allowed) return { snapshot, denial: null };
  return {
    snapshot,
    denial: {
      kind: check.reason.includes("お支払い") ? "plan" : "limit",
      status: check.reason.includes("お支払い") ? 403 : 429,
      reason: check.reason,
      currentPlan: snapshot.effectivePlanId,
      currentPlanName: snapshot.effectivePlanName,
      requiredPlan: null,
      requiredPlanName: null,
      upgradePath: BILLING_UPGRADE_PATH,
    },
  };
}

export async function evaluateBillingExternalIntegration(
  userId: string,
  connectedCount: number,
): Promise<{ snapshot: BillingAccessSnapshot; denial: BillingDenial | null }> {
  const snapshot = await getBillingAccessSnapshot(userId);
  if (snapshot.isOwner) return { snapshot, denial: null };
  const check = evaluateExternalIntegrationAccess(userId, connectedCount);
  if (check.allowed) return { snapshot, denial: null };
  return {
    snapshot,
    denial: {
      kind: "limit",
      status: 403,
      reason: check.reason,
      currentPlan: snapshot.effectivePlanId,
      currentPlanName: snapshot.effectivePlanName,
      requiredPlan: connectedCount >= 1 ? "premium" : "light",
      requiredPlanName: getPlanDefinition(
        connectedCount >= 1 ? "premium" : "light",
      ).name,
      upgradePath: BILLING_UPGRADE_PATH,
    },
  };
}

/** Map orchestration/feature intent to existing BillingFeatureId (no new features). */
export function resolveBillingFeatureForAssignment(input: {
  assignment: string;
  metadata?: Readonly<Record<string, unknown>>;
}): BillingFeatureId {
  const text = `${input.assignment} ${JSON.stringify(input.metadata ?? {})}`.toLowerCase();

  if (
    /sns|ツイート|tweet|x投稿|instagram|インスタ|facebook|linkedin|ソーシャル/.test(
      text,
    )
  ) {
    return "sns_assist";
  }
  if (/ブログ|blog|wordpress|記事/.test(text)) {
    return "blog_creation";
  }
  if (/動画|video|youtube|ユーチューブ|ショート/.test(text)) {
    return "video_generation";
  }
  if (
    /画像生成|image generation|アイキャッチ|サムネ|thumbnail|イラスト生成/.test(
      text,
    )
  ) {
    return "image_generation";
  }
  return "content_writing";
}

export function billingDenialToJson(denial: BillingDenial): Record<string, unknown> {
  return {
    error: "plan_required",
    message: denial.reason,
    reason: denial.reason,
    currentPlan: denial.currentPlan,
    currentPlanName: denial.currentPlanName,
    requiredPlan: denial.requiredPlan,
    requiredPlanName: denial.requiredPlanName,
    upgradePath: denial.upgradePath,
  };
}

export function billingDenialResponse(denial: BillingDenial): Response {
  return Response.json(billingDenialToJson(denial), { status: denial.status });
}
