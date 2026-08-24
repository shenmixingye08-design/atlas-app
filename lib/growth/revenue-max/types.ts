import type { PlanId } from "@/lib/billing/plans/types";

export const REVENUE_MAX_EVENT_NAMES = [
  "onboarding_started",
  "first_usecase_selected",
  "first_request_started",
  "first_request_succeeded",
  "first_request_failed",
  "upgrade_viewed",
  "checkout_started",
  "checkout_completed",
  "checkout_abandoned",
  "checkout_failed",
  "cancellation_started",
  "cancellation_reason_selected",
  "cancellation_completed",
  "cancellation_abandoned",
  "subscription_reactivated",
  "experiment_exposed",
] as const;

export type RevenueMaxEventName = (typeof REVENUE_MAX_EVENT_NAMES)[number];

export type RevenueMaxEvent = {
  eventId: string;
  eventName: RevenueMaxEventName;
  occurredAt: string;
  userId: string;
  dedupeKey: string;
  metadata: Record<string, string | number | boolean | null>;
};

export type PainChoice =
  | "repeat_work"
  | "sns_posting"
  | "documents"
  | "schedule";

export type FirstUsecaseId = "sns" | "automation" | "document" | "schedule";

export type CheckoutFailClass =
  | "user_cancelled"
  | "stripe_payment_failed"
  | "price_mismatch"
  | "auth_expired"
  | "network"
  | "webhook_pending"
  | "unknown";

export type LifecycleState =
  | "registered_not_activated"
  | "activated_free"
  | "active_free"
  | "checkout_abandoned"
  | "new_paid"
  | "active_paid"
  | "paid_at_risk"
  | "canceled"
  | "reactivated";

export type ExperimentStatus =
  | "running"
  | "insufficient_data"
  | "candidate_winner"
  | "stopped"
  | "adopted"
  | "rejected";

export type RevenueMaxUserState = {
  userId: string;
  registeredAt: string | null;
  pain: PainChoice | null;
  usecase: FirstUsecaseId | null;
  onboardingStartedAt: string | null;
  firstRequestAt: string | null;
  firstSuccessAt: string | null;
  firstFailAt: string | null;
  lastValueAt: string | null;
  lastFailMessage: string | null;
  lastSuccessSummary: string | null;
  hadPaid: boolean;
  checkoutSessionId: string | null;
  checkoutStartedAt: string | null;
  checkoutOutcome: "started" | "completed" | "abandoned" | "failed" | null;
  checkoutFailClass: CheckoutFailClass | null;
  resumeShownAt: string | null;
  atRiskShownAt: string | null;
  upgradeDismissedAt: string | null;
  lastUpgradeViewedPlan: PlanId | null;
  variants: Record<string, string>;
  events: RevenueMaxEvent[];
  updatedAt: string;
};

export type UpgradeTrigger =
  | "usage_80"
  | "usage_exhausted"
  | "repeat_request"
  | "schedule_recurring"
  | "paid_feature"
  | "integration_limit"
  | "deliverable_limit"
  | "ai_limit"
  | "automation_habit"
  | "value_30d";

export type ContextualUpgradeView = {
  show: boolean;
  trigger: UpgradeTrigger | null;
  currentPlanId: PlanId;
  currentPlanName: string;
  recommendedPlanId: PlanId | null;
  recommendedPlanName: string | null;
  recommendedPriceJpy: number | null;
  priceIdReady: boolean;
  reachedLimitLabel: string | null;
  reason: string | null;
  addedFeatures: string[];
  billingCycle: string;
  cancelPolicy: string;
  currentUsed: number | null;
  currentLimit: number | null;
  priceDeltaYen: number | null;
  nextInvoiceNote: string | null;
  downgradeNote: string | null;
};

export type MeasuredValueView = {
  completedJobs: number | null;
  automationSuccesses: number | null;
  deliverables: number | null;
  xPosts: number | null;
  usageThisMonth: number | null;
  activeAutomations: number | null;
  previousMonthJobs: number | null;
};
