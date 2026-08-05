import "server-only";

import { getBillingAccessSnapshot } from "@/lib/billing/access/snapshot";
import { getPlanDefinition } from "@/lib/billing/plans/registry";
import type { PlanId } from "@/lib/billing/plans/types";
import type { UsageCounters } from "@/lib/billing/usage/types";
import { getUsageSnapshot, incrementUsageCounter } from "@/lib/billing/usage/store";
import {
  createSecurityRequestId,
  recordSecurityAudit,
} from "@/lib/security/audit/security-audit";

export type DeliverableQuotaKind = "word" | "excel" | "image" | "pdf" | "powerpoint";

/** Monthly deliverable generation caps by plan (hard ceilings for abuse control). */
const DELIVERABLE_MONTHLY_CAPS: Record<
  PlanId,
  Record<DeliverableQuotaKind, number>
> = {
  // Free: small upload/generate ceilings — never unlimited image flood.
  free: { word: 5, excel: 3, image: 5, pdf: 5, powerpoint: 2 },
  light: { word: 40, excel: 20, image: 15, pdf: 40, powerpoint: 15 },
  standard: { word: 120, excel: 80, image: 40, pdf: 120, powerpoint: 60 },
  premium: { word: 500, excel: 400, image: 200, pdf: 500, powerpoint: 300 },
};

function counterKey(kind: DeliverableQuotaKind): keyof UsageCounters {
  return `deliverable_${kind}`;
}

export type FreeUserControlResult =
  | { allowed: true; planId: PlanId; used: number; limit: number; request_id: string }
  | {
      allowed: false;
      planId: PlanId;
      used: number;
      limit: number;
      reason: string;
      request_id: string;
      status: 402 | 403 | 429;
    };

/**
 * Block free/paid users from exceeding deliverable generation quotas.
 * Free users cannot use image generation at all (paid Premium feature).
 */
export async function assertDeliverableQuota(input: {
  userId: string;
  kind: DeliverableQuotaKind;
  requestId?: string;
  ip?: string | null;
  /** When true, imageGeneration plan feature is required (not only monthly cap). */
  requirePaidImageFeature?: boolean;
}): Promise<FreeUserControlResult> {
  const request_id = input.requestId ?? createSecurityRequestId();
  const snapshot = await getBillingAccessSnapshot(input.userId);

  if (snapshot.isOwner) {
    return {
      allowed: true,
      planId: snapshot.effectivePlanId,
      used: 0,
      limit: Number.MAX_SAFE_INTEGER,
      request_id,
    };
  }

  const planId = snapshot.effectivePlanId;
  const plan = getPlanDefinition(planId);
  const limit = DELIVERABLE_MONTHLY_CAPS[planId][input.kind];

  // Image *generation* (paid feature) is separate from capped uploads.
  // When callers mark requirePaidImageFeature, free plans are hard-denied.
  if (
    input.kind === "image" &&
    input.requirePaidImageFeature &&
    !plan.limits.imageGeneration
  ) {
    const result: FreeUserControlResult = {
      allowed: false,
      planId,
      used: 0,
      limit: 0,
      reason: "画像生成は有料プランでご利用いただけます",
      request_id,
      status: 402,
    };
    recordSecurityAudit({
      request_id,
      who: input.userId,
      what: `billing.quota.${input.kind}`,
      whereFrom: input.ip ?? null,
      resource: "billing",
      action: "checkout",
      success: false,
      reason: result.reason,
      decision: "deny_billing",
      durationMs: 0,
    });
    return result;
  }

  const usage = getUsageSnapshot(input.userId);
  const used = usage[counterKey(input.kind)] ?? 0;

  if (used >= limit) {
    const result: FreeUserControlResult = {
      allowed: false,
      planId,
      used,
      limit,
      reason: `${input.kind.toUpperCase()}生成の月間上限（${limit}件）に達しました。プランをアップグレードしてください`,
      request_id,
      status: 429,
    };
    recordSecurityAudit({
      request_id,
      who: input.userId,
      what: `billing.quota.${input.kind}`,
      whereFrom: input.ip ?? null,
      resource: "billing",
      action: "checkout",
      success: false,
      reason: result.reason,
      decision: "deny_quota",
      durationMs: 0,
    });
    return result;
  }

  return { allowed: true, planId, used, limit, request_id };
}

export function consumeDeliverableQuota(input: {
  userId: string;
  kind: DeliverableQuotaKind;
}): number {
  const next = incrementUsageCounter(input.userId, counterKey(input.kind), 1);
  return next[counterKey(input.kind)];
}

export function deliverableQuotaDeniedResponse(
  result: Extract<FreeUserControlResult, { allowed: false }>,
): Response {
  return Response.json(
    {
      error: result.reason,
      code: result.status === 402 ? "plan_required" : "quota_exceeded",
      planId: result.planId,
      used: result.used,
      limit: result.limit,
      request_id: result.request_id,
      upgradePath: "/settings/billing",
    },
    { status: result.status },
  );
}

/** Paid feature ids that free users must never access. */
export const FREE_BLOCKED_FEATURES = [
  "sns_assist",
  "sns_auto_post",
  "blog_creation",
  "google_integration",
  "eco_mode",
  "advanced_automation",
  "multi_external_integration",
  "high_quality_mode",
  "priority_processing",
  "video_generation",
  "image_generation",
] as const;
