import "server-only";

import { getClerkUserPrimaryEmail } from "@/lib/auth/get-clerk-user-email";
import { isAtlasOwnerEmail } from "@/lib/auth/is-atlas-owner";
import { isAtlasBetaUserEmail } from "@/lib/feature-flags/access";
import { siteConfig } from "@/lib/config/site";

import { resolveMinimumOfferedPlanForFeature } from "../plans/offered-capabilities";
import { getPlanDefinition, listPlanDefinitions } from "../plans/registry";
import type { BillingFeatureId, PlanId } from "../plans/types";
import { resolveUserSubscriptionAuthority } from "../subscriptions/store";
import {
  isPaidCapableStatus,
  resolveEffectivePlanIdFromRecord,
  toUserSubscriptionView,
} from "../subscriptions/service";
import type { SubscriptionStatus } from "../subscriptions/types";
import { getUsageSnapshot } from "../usage/store";
import { getUserUsageLimitSummary } from "../usage/service";
import { formatOtherMetersRemain } from "../usage-awareness/copy";
import type { UsageMeterId } from "../usage-awareness/types";
import { buildUsageAwarenessView } from "../usage-awareness/view";
import {
  evaluateAiUsageAccess,
  evaluateAutomationTaskAccess,
  evaluateExternalIntegrationAccess,
  evaluatePlanAccess,
  evaluateSnsPostAccess,
  evaluateWordPressPublishAccess,
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

/**
 * Lowest plan that includes the feature.
 * Returns null when the feature is not offered on any plan (N-01:
 * never imply "upgrade to Premium" for unimplemented media generation).
 */
export function getMinimumPlanForFeature(
  feature: BillingFeatureId,
): PlanId | null {
  return resolveMinimumOfferedPlanForFeature(feature);
}

export async function getBillingAccessSnapshot(
  userId: string,
): Promise<BillingAccessSnapshot> {
  const authority = await resolveUserSubscriptionAuthority(userId);
  const view = toUserSubscriptionView(authority.record);
  const email = await getClerkUserPrimaryEmail(userId);
  const effectivePlanId = resolveEffectivePlanIdFromRecord(authority.record);

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
  used?: number;
  limit?: number;
  remaining?: number;
  resetLabel?: string;
  recommendedPlan?: PlanId | null;
  recommendedPlanName?: string | null;
  recommendedLimit?: number | null;
  otherFeaturesRemain?: string | null;
};

function attachLimitAwareness(
  denial: BillingDenial,
  userId: string,
  meterId: UsageMeterId,
): BillingDenial {
  const usage = getUserUsageLimitSummary(userId);
  const view = buildUsageAwarenessView({
    usage,
    catalog: listPlanDefinitions(),
    subscribedPlanId: denial.currentPlan,
  });
  const item = view.items.find((row) => row.id === meterId);
  if (!item) return denial;
  return {
    ...denial,
    used: item.used,
    limit: item.limit,
    remaining: item.remaining,
    resetLabel: item.resetLabel,
    recommendedPlan: item.primaryUpgrade?.planId ?? null,
    recommendedPlanName: item.primaryUpgrade?.planName ?? null,
    recommendedLimit: item.primaryUpgrade?.nextLimit ?? null,
    otherFeaturesRemain: formatOtherMetersRemain(view.items),
  };
}

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
  if (check.allowed) {
    return { snapshot, denial: null };
  }

  const requiredPlan = getMinimumPlanForFeature(feature);
  if (!requiredPlan) {
    return {
      snapshot,
      denial: {
        kind: "plan",
        status: 403,
        reason: "この機能は現在ご利用いただけません",
        currentPlan: snapshot.effectivePlanId,
        currentPlanName: snapshot.effectivePlanName,
        requiredPlan: null,
        requiredPlanName: null,
        upgradePath: BILLING_UPGRADE_PATH,
      },
    };
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
    denial: attachLimitAwareness(
      {
        kind: "limit",
        status: 429,
        reason: check.reason,
        currentPlan: snapshot.effectivePlanId,
        currentPlanName: snapshot.effectivePlanName,
        requiredPlan: null,
        requiredPlanName: null,
        upgradePath: BILLING_UPGRADE_PATH,
      },
      userId,
      "aiRuns",
    ),
  };
}

export async function evaluateBillingSnsPost(
  userId: string,
  options: { text?: string; containsUrl?: boolean } = {},
): Promise<{ snapshot: BillingAccessSnapshot; denial: BillingDenial | null }> {
  const snapshot = await getBillingAccessSnapshot(userId);
  if (snapshot.isOwner) return { snapshot, denial: null };
  const check = evaluateSnsPostAccess(userId, options);
  if (check.allowed) return { snapshot, denial: null };
  const needsPlan = check.reason.includes("利用できません");
  const denial: BillingDenial = {
    kind: needsPlan ? "plan" : "limit",
    status: needsPlan ? 403 : 429,
    reason: check.reason,
    currentPlan: snapshot.effectivePlanId,
    currentPlanName: snapshot.effectivePlanName,
    requiredPlan: needsPlan ? "standard" : null,
    requiredPlanName: needsPlan ? getPlanDefinition("standard").name : null,
    upgradePath: BILLING_UPGRADE_PATH,
  };
  return {
    snapshot,
    denial: needsPlan
      ? denial
      : attachLimitAwareness(
          denial,
          userId,
          check.reason.includes("URL") ? "xUrlPosts" : "snsPosts",
        ),
  };
}

export async function evaluateBillingWordPressPublish(
  userId: string,
): Promise<{ snapshot: BillingAccessSnapshot; denial: BillingDenial | null }> {
  const snapshot = await getBillingAccessSnapshot(userId);
  if (snapshot.isOwner) return { snapshot, denial: null };

  const feature = evaluatePlanAccess(userId, "blog_creation");
  if (!feature.allowed) {
    const requiredPlan = getMinimumPlanForFeature("blog_creation") ?? "standard";
    const planName = getPlanDefinition(requiredPlan).name;
    return {
      snapshot,
      denial: {
        kind: "plan",
        status: 403,
        reason: `この機能は${planName}プラン以上でご利用いただけます（現在: ${snapshot.effectivePlanName}）`,
        currentPlan: snapshot.effectivePlanId,
        currentPlanName: snapshot.effectivePlanName,
        requiredPlan,
        requiredPlanName: planName,
        upgradePath: BILLING_UPGRADE_PATH,
      },
    };
  }

  const check = evaluateWordPressPublishAccess(userId);
  if (check.allowed) return { snapshot, denial: null };
  const needsPlan = check.reason.includes("利用できません");
  const denial: BillingDenial = {
    kind: needsPlan ? "plan" : "limit",
    status: needsPlan ? 403 : 429,
    reason: check.reason,
    currentPlan: snapshot.effectivePlanId,
    currentPlanName: snapshot.effectivePlanName,
    requiredPlan: needsPlan ? "standard" : null,
    requiredPlanName: needsPlan ? getPlanDefinition("standard").name : null,
    upgradePath: BILLING_UPGRADE_PATH,
  };
  return {
    snapshot,
    denial: needsPlan
      ? denial
      : attachLimitAwareness(denial, userId, "wordpressPosts"),
  };
}

export async function evaluateBillingAutomationTask(
  userId: string,
  currentTaskCount: number,
): Promise<{ snapshot: BillingAccessSnapshot; denial: BillingDenial | null }> {
  const snapshot = await getBillingAccessSnapshot(userId);
  if (snapshot.isOwner) return { snapshot, denial: null };
  const check = await evaluateAutomationTaskAccess(userId, currentTaskCount);
  if (check.allowed) return { snapshot, denial: null };
  const denial: BillingDenial = {
    kind: check.reason.includes("お支払い") ? "plan" : "limit",
    status: check.reason.includes("お支払い") ? 403 : 429,
    reason: check.reason,
    currentPlan: snapshot.effectivePlanId,
    currentPlanName: snapshot.effectivePlanName,
    requiredPlan: null,
    requiredPlanName: null,
    upgradePath: BILLING_UPGRADE_PATH,
  };
  return {
    snapshot,
    denial: check.reason.includes("お支払い")
      ? denial
      : attachLimitAwareness(denial, userId, "automationTasks"),
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
  // N-01: Only explicit media-generation intents map to unoffered features.
  // Broad words like「動画」「サムネ」alone must not deny ordinary copywriting.
  if (
    /動画生成|video generation|generate video|動画を作|動画制作|動画編集/.test(
      text,
    )
  ) {
    return "video_generation";
  }
  if (
    /画像生成|image generation|generate image|イラスト生成|画像を生成/.test(
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
    used: denial.used,
    limit: denial.limit,
    remaining: denial.remaining,
    resetLabel: denial.resetLabel,
    recommendedPlan: denial.recommendedPlan,
    recommendedPlanName: denial.recommendedPlanName,
    recommendedLimit: denial.recommendedLimit,
    otherFeaturesRemain: denial.otherFeaturesRemain,
  };
}

export function billingDenialResponse(denial: BillingDenial): Response {
  return Response.json(billingDenialToJson(denial), { status: denial.status });
}
