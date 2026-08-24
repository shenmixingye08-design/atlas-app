import { getPlanDefinition, PLAN_DEFINITIONS } from "@/lib/billing/plans/registry";
import type { PlanId } from "@/lib/billing/plans/types";
import { getStripePriceIdForPlan } from "@/lib/billing/stripe/config";
import { recommendUpgradeForMeter } from "@/lib/billing/usage-awareness/recommend";
import type { UsageMeterId } from "@/lib/billing/usage-awareness/types";

import type { ContextualUpgradeView, UpgradeTrigger } from "./types";

export const USAGE_80_RATE = 0.8;

export function usageReached80(used: number, limit: number): boolean {
  if (!Number.isFinite(limit) || limit <= 0) return false;
  return used / limit >= USAGE_80_RATE && used < limit;
}

export function usageExhausted(used: number, limit: number): boolean {
  if (!Number.isFinite(limit) || limit <= 0) return false;
  return used >= limit;
}

export function classifyUpgradeTrigger(input: {
  used: number;
  limit: number;
  meterId: UsageMeterId;
  sameRequestCount?: number;
  schedulingRecurring?: boolean;
  selectingPaidFeature?: boolean;
  integrationAtLimit?: boolean;
  automationActiveDays?: number;
  valueEventsLast30d?: number;
}): UpgradeTrigger | null {
  if (input.selectingPaidFeature) return "paid_feature";
  if (input.schedulingRecurring) return "schedule_recurring";
  if (input.integrationAtLimit) return "integration_limit";
  if (usageExhausted(input.used, input.limit)) {
    if (input.meterId === "aiRuns") return "ai_limit";
    return "usage_exhausted";
  }
  if (usageReached80(input.used, input.limit)) return "usage_80";
  if ((input.sameRequestCount ?? 0) >= 2) return "repeat_request";
  if ((input.automationActiveDays ?? 0) >= 7) return "automation_habit";
  if ((input.valueEventsLast30d ?? 0) >= 2) return "value_30d";
  return null;
}

const TRIGGER_COPY: Record<UpgradeTrigger, string> = {
  usage_80: "今月の利用枠の80％に達しています。",
  usage_exhausted: "今月の利用枠を使い切りました。",
  repeat_request: "同じ依頼を2回以上実行しています。",
  schedule_recurring: "定期実行を設定しようとしています。",
  paid_feature: "現在のプランに含まれない機能を選んでいます。",
  integration_limit: "外部連携数の上限に達しています。",
  deliverable_limit: "成果物の利用枠上限に達しています。",
  ai_limit: "AI利用回数の上限に達しています。",
  automation_habit: "自動化を継続して使っています。",
  value_30d: "過去30日で複数回、仕事が完了しています。",
};

export function buildContextualUpgrade(input: {
  currentPlanId: PlanId;
  trigger: UpgradeTrigger | null;
  meterId?: UsageMeterId;
  used?: number | null;
  limit?: number | null;
  dismissedAt?: string | null;
  now?: Date;
}): ContextualUpgradeView {
  const current = getPlanDefinition(input.currentPlanId);
  const empty: ContextualUpgradeView = {
    show: false,
    trigger: null,
    currentPlanId: input.currentPlanId,
    currentPlanName: current.name,
    recommendedPlanId: null,
    recommendedPlanName: null,
    recommendedPriceJpy: null,
    priceIdReady: false,
    reachedLimitLabel: null,
    reason: null,
    addedFeatures: [],
    billingCycle: "月額（税込表示。日本円）",
    cancelPolicy: "Stripeカスタマーポータルからいつでも解約できます。期間終了まで利用できます。",
    currentUsed: null,
    currentLimit: null,
    priceDeltaYen: null,
    nextInvoiceNote: null,
    downgradeNote: null,
  };
  if (!input.trigger) return empty;
  if (input.dismissedAt) {
    const dismissed = Date.parse(input.dismissedAt);
    if (!Number.isNaN(dismissed) && (input.now ?? new Date()).getTime() - dismissed < 24 * 60 * 60 * 1000) {
      return empty;
    }
  }

  const rec = input.meterId
    ? recommendUpgradeForMeter({
        currentPlanId: input.currentPlanId,
        meterId: input.meterId,
        plans: PLAN_DEFINITIONS,
      })
    : recommendUpgradeForMeter({
        currentPlanId: input.currentPlanId,
        meterId: "aiRuns",
        plans: PLAN_DEFINITIONS,
      });
  if (!rec) return empty;

  const priceId = getStripePriceIdForPlan(rec.primary.planId);
  const nextPlan = getPlanDefinition(rec.primary.planId);
  const added = nextPlan.highlights.slice(0, 3);

  return {
    show: true,
    trigger: input.trigger,
    currentPlanId: input.currentPlanId,
    currentPlanName: current.name,
    recommendedPlanId: rec.primary.planId,
    recommendedPlanName: rec.primary.planName,
    recommendedPriceJpy: rec.primary.monthlyPriceJpy,
    priceIdReady: Boolean(priceId),
    reachedLimitLabel: TRIGGER_COPY[input.trigger],
    reason: TRIGGER_COPY[input.trigger],
    addedFeatures: added,
    billingCycle: "月額（税込表示。日本円）",
    cancelPolicy: "Stripeカスタマーポータルからいつでも解約できます。期間終了まで利用できます。",
    currentUsed: input.used ?? null,
    currentLimit: input.limit ?? null,
    priceDeltaYen: rec.primary.monthlyPriceJpy - current.monthlyPriceJpy,
    nextInvoiceNote:
      "次回請求は推奨プランの月額です。日割り額はStripeの実際の請求に従います。",
    downgradeNote:
      "下位プランに戻すと、そのプランの上限と機能に戻ります。未使用分の返金は行いません。",
  };
}

export function canStartCheckout(view: {
  show: boolean;
  recommendedPlanId?: string | null;
  priceIdReady: boolean;
}): boolean {
  return view.show && Boolean(view.recommendedPlanId) && view.priceIdReady;
}
