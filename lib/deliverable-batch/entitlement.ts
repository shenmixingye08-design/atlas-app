import { getUsageMonthKey } from "@/lib/billing/usage/period";
import { getUsageSnapshot } from "@/lib/billing/usage/store";
import { getPlanDefinition } from "@/lib/billing/plans/registry";
import { resolveEffectivePlanId } from "@/lib/billing/policy";

import {
  isAllowedDeliverableBatchCount,
  resolveDeliverableBatchMaxItems,
} from "./config";
import { DELIVERABLE_BATCH_LIVE_FORMATS } from "./types";
import type { DeliverableBatchFormat } from "./types";

export type DeliverableBatchEntitlement = {
  allowed: boolean;
  reason: string | null;
  maxItems: number;
  remainingAiRuns: number;
  aiLimit: number;
  formatAllowed: boolean;
  zipAllowed: boolean;
};

export function evaluateDeliverableBatchEntitlement(input: {
  userId: string;
  requestedCount: number;
  format: DeliverableBatchFormat;
}): DeliverableBatchEntitlement {
  const maxItems = resolveDeliverableBatchMaxItems();
  const planId = resolveEffectivePlanId(input.userId) ?? "free";
  const plan = getPlanDefinition(planId);
  const usage = getUsageSnapshot(input.userId, getUsageMonthKey());
  const remainingAiRuns = Math.max(0, plan.limits.aiUsageMonthly - (usage.aiRuns ?? 0));
  const formatAllowed = (DELIVERABLE_BATCH_LIVE_FORMATS as readonly string[]).includes(
    input.format,
  );
  if (!formatAllowed) {
    return {
      allowed: false,
      reason: "この形式は現在お使いいただけません。",
      maxItems,
      remainingAiRuns,
      aiLimit: plan.limits.aiUsageMonthly,
      formatAllowed: false,
      zipAllowed: true,
    };
  }
  if (!isAllowedDeliverableBatchCount(input.requestedCount)) {
    return {
      allowed: false,
      reason: "作成数は 3・5・7・10・12 から選んでください。",
      maxItems,
      remainingAiRuns,
      aiLimit: plan.limits.aiUsageMonthly,
      formatAllowed,
      zipAllowed: true,
    };
  }
  if (input.requestedCount > maxItems) {
    return {
      allowed: false,
      reason: `一度に作れるのは${maxItems}件までです。`,
      maxItems,
      remainingAiRuns,
      aiLimit: plan.limits.aiUsageMonthly,
      formatAllowed,
      zipAllowed: true,
    };
  }
  if (remainingAiRuns <= 0) {
    return {
      allowed: false,
      reason: "今月のAI利用上限に達しています。",
      maxItems,
      remainingAiRuns,
      aiLimit: plan.limits.aiUsageMonthly,
      formatAllowed,
      zipAllowed: true,
    };
  }
  return {
    allowed: true,
    reason: null,
    maxItems,
    remainingAiRuns,
    aiLimit: plan.limits.aiUsageMonthly,
    formatAllowed,
    zipAllowed: true,
  };
}
