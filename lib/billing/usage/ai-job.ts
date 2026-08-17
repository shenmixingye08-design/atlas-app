/**
 * Formal definition: one user-facing top-level AI job = 1 quota run.
 * Internal retries / extra model calls do not increment again (claimKey).
 */

import { getPlanDefinition } from "@/lib/billing/plans/registry";
import { resolveEffectivePlanId } from "@/lib/billing/policy";
import { getClerkUserPrimaryEmail } from "@/lib/auth/get-clerk-user-email";
import { isAtlasOwnerEmail } from "@/lib/auth/is-atlas-owner";

import { reserveAiJobQuota, type AiQuotaReserveResult } from "./quota-engine";

export const AI_JOB_QUOTA_DEFINITION =
  "ユーザーが依頼したトップレベルのAI作業1件 = 1回。内部のintent/生成/再試行は同一claimで二重計上しない。";

export async function consumeAiJobQuota(input: {
  userId: string;
  claimKey: string;
}): Promise<AiQuotaReserveResult> {
  const email = await getClerkUserPrimaryEmail(input.userId);
  if (isAtlasOwnerEmail(email)) {
    return {
      ok: true,
      used: 0,
      limit: Number.POSITIVE_INFINITY,
      idempotent: true,
      source: "memory",
    };
  }
  const planId = resolveEffectivePlanId(input.userId);
  const limit = getPlanDefinition(planId).limits.aiUsageMonthly;
  return reserveAiJobQuota({
    userId: input.userId,
    claimKey: input.claimKey,
    limit,
  });
}

export function aiJobClaimKey(surface: string, userId: string, stableId: string): string {
  return `${surface}:${userId}:${stableId.trim()}`;
}
