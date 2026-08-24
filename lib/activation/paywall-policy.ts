import { getPlanDefinition, listPlanDefinitions } from "@/lib/billing/plans/registry";
import type { PlanId } from "@/lib/billing/plans/types";

import type { ActivationPaywallReason } from "./types";

export type ActivationPaywallView = {
  show: boolean;
  reason: ActivationPaywallReason | null;
  currentPlan: PlanId;
  targetPlan: PlanId | null;
  currentPriceJpy: number;
  targetPriceJpy: number | null;
  accomplished: string;
  nextValue: string;
};

export function resolveActivationPaywall(input: {
  planId: PlanId | string | null;
  reason: ActivationPaywallReason | null;
  firstSuccess: boolean;
  paid: boolean;
}): ActivationPaywallView {
  const currentPlan = (input.planId as PlanId | undefined) ?? "free";
  const current = getPlanDefinition(
    currentPlan === "light" ||
      currentPlan === "standard" ||
      currentPlan === "premium"
      ? currentPlan
      : "free",
  );
  if (input.paid || !input.reason) {
    return {
      show: false,
      reason: null,
      currentPlan: current.planId,
      targetPlan: null,
      currentPriceJpy: current.monthlyPriceJpy,
      targetPriceJpy: null,
      accomplished: "",
      nextValue: "",
    };
  }

  const target =
    input.reason === "paid_feature"
      ? getPlanDefinition("standard")
      : getPlanDefinition("light");

  return {
    show: true,
    reason: input.reason,
    currentPlan: current.planId,
    targetPlan: target.planId,
    currentPriceJpy: current.monthlyPriceJpy,
    targetPriceJpy: target.monthlyPriceJpy,
    accomplished: input.firstSuccess
      ? "最初の仕事を確認できるところまで進みました。"
      : "いまのプランの範囲で作成を続けられます。",
    nextValue:
      input.reason === "automation_limit"
        ? `自動化を${target.limits.automationTasks}件まで増やせます。`
        : input.reason === "paid_feature"
          ? "カレンダーなど、いまのプランに含まれない連携を使えるようになります。"
          : `AI利用を月${target.limits.aiUsageMonthly}回まで続けられます。`,
  };
}

export function catalogPricesForTests(): Array<{ id: string; price: number }> {
  return listPlanDefinitions().map((plan) => ({
    id: plan.planId,
    price: plan.monthlyPriceJpy,
  }));
}
