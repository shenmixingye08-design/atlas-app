import type { PlanId } from "@/lib/billing/plans/types";
import { isPaidCapableStatus } from "@/lib/billing/subscriptions/service";
import type { SubscriptionStatus } from "@/lib/billing/subscriptions/types";

import type { LifecycleState, RevenueMaxUserState } from "./types";

export const DEFAULT_AT_RISK_IDLE_DAYS = 14;

function resolvePaidState(input: {
  state: RevenueMaxUserState;
  lastValueAt: string | null;
  now: Date;
  idleDays?: number;
  reactivated?: boolean;
}): LifecycleState {
  const idleMs = (input.idleDays ?? DEFAULT_AT_RISK_IDLE_DAYS) * 24 * 60 * 60 * 1000;
  const lastMs = input.lastValueAt ? Date.parse(input.lastValueAt) : NaN;
  const startedMs = input.state.checkoutStartedAt
    ? Date.parse(input.state.checkoutStartedAt)
    : NaN;
  const isNew =
    Number.isFinite(startedMs) && input.now.getTime() - startedMs <= 7 * 24 * 60 * 60 * 1000;
  if (!Number.isFinite(lastMs) || input.now.getTime() - lastMs >= idleMs) {
    return "paid_at_risk";
  }
  if (input.reactivated) return "reactivated";
  return isNew ? "new_paid" : "active_paid";
}

export function resolveLifecycleState(input: {
  state: RevenueMaxUserState;
  planId: PlanId;
  subscriptionStatus: SubscriptionStatus | null;
  lastValueAt: string | null;
  hadPaid?: boolean;
  previousPaid?: boolean;
  now?: Date;
  idleDays?: number;
}): LifecycleState {
  const now = input.now ?? new Date();
  const paid =
    input.planId !== "free" &&
    Boolean(input.subscriptionStatus && isPaidCapableStatus(input.subscriptionStatus));
  const hadPaid = Boolean(input.hadPaid || input.previousPaid);

  if (paid) {
    return resolvePaidState({
      state: input.state,
      lastValueAt: input.lastValueAt,
      now,
      idleDays: input.idleDays,
      reactivated: Boolean(input.previousPaid && input.state.checkoutOutcome === "completed"),
    });
  }

  if (hadPaid) return "canceled";
  if (input.state.checkoutOutcome === "abandoned") return "checkout_abandoned";
  if (input.state.firstSuccessAt) {
    const successMs = Date.parse(input.state.firstSuccessAt);
    const recent =
      Number.isFinite(successMs) && now.getTime() - successMs <= 7 * 24 * 60 * 60 * 1000;
    return recent ? "activated_free" : "active_free";
  }
  return "registered_not_activated";
}

export function isPaidAtRisk(state: LifecycleState): boolean {
  return state === "paid_at_risk";
}
