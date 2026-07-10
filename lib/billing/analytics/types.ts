import type { PlanId } from "../plans/types";

export type OwnerPlanBreakdown = {
  planId: PlanId;
  planName: string;
  monthlyPriceJpy: number;
  activeSubscribers: number;
  mrrJpy: number;
};

export type OwnerBillingMetrics = {
  monthlyRevenueJpy: number;
  mrrJpy: number;
  paidSubscribers: number;
  freeSubscribers: number;
  churnedSubscribers: number;
  planBreakdown: readonly OwnerPlanBreakdown[];
  stripeConnected: boolean;
};
