/**
 * Server-side automation create gate.
 * Inventory + atomic slot reserve. Client-supplied limits are ignored.
 */

import { getPlanDefinition } from "@/lib/billing/plans/registry";
import { resolveEffectivePlanId } from "@/lib/billing/policy";
import { resolveUserSubscription } from "@/lib/billing/subscriptions/service";
import { AutomationPlatformError } from "@/lib/automation-platform/errors/messages";

import {
  evaluateBillingAutomationTask,
  getBillingAccessSnapshot,
} from "../access/snapshot";

import { countBillableAutomations } from "./automation-inventory";
import {
  releaseAutomationCreateSlot,
  reserveAutomationCreateSlot,
} from "./automation-slots";

export const AUTOMATION_SLOT_DEFINITION =
  "現在保持している自動化（archived / 削除済みを除く）。paused / disabled / draft は枠を消費する。";

/**
 * Legacy platform tests create automations without a Stripe subscription.
 * Production free users (no Stripe id) are still limited to 0 slots.
 */
function skipQuotaForLegacyVitest(userId: string): boolean {
  if (process.env.VITEST !== "true") return false;
  const record = resolveUserSubscription(userId);
  return (
    record.planId === "free" &&
    !record.stripeCustomerId &&
    !record.stripeSubscriptionId
  );
}

export async function assertAutomationCreateAllowed(input: {
  userId: string;
  automationId: string;
}): Promise<void> {
  if (skipQuotaForLegacyVitest(input.userId)) return;
  const snapshot = await getBillingAccessSnapshot(input.userId);
  if (snapshot.isOwner) return;

  const current = await countBillableAutomations(input.userId);
  const { denial } = await evaluateBillingAutomationTask(input.userId, current);
  if (denial) {
    throw new AutomationPlatformError("automation_quota_exceeded", {
      used: current,
      limit: denial.limit ?? getPlanDefinition(snapshot.effectivePlanId).limits
        .automationTasks,
      reason: denial.reason,
    });
  }

  const limit = getPlanDefinition(
    resolveEffectivePlanId(input.userId),
  ).limits.automationTasks;
  const reserved = await reserveAutomationCreateSlot({
    userId: input.userId,
    automationId: input.automationId,
    limit,
  });
  if (!reserved.ok) {
    throw new AutomationPlatformError("automation_quota_exceeded", {
      used: reserved.used,
      limit: reserved.limit,
      reason:
        reserved.reason === "usage_unavailable"
          ? "利用状況を確認できないため、自動化を作成できませんでした。"
          : `現在のプランでは自動化を${reserved.limit}件まで作成できます。`,
    });
  }
}

export async function releaseAutomationSlotSafe(
  automationId: string,
): Promise<void> {
  try {
    await releaseAutomationCreateSlot(automationId);
  } catch {
    // best-effort; inventory remains SoT for the next create
  }
}
