import type { PlanId } from "../plans/types";
import type { SubscriptionStatus } from "../subscriptions/types";
import type { StripeWebhookEventType } from "../stripe/config";

export type BillingHistoryEventType =
  | StripeWebhookEventType
  | "plan_downgraded"
  | "payment_grace_scheduled";

export type BillingHistoryRecord = {
  id: string;
  userId: string;
  planId: PlanId;
  status: SubscriptionStatus | "payment_failed" | "payment_succeeded" | "refunded";
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  eventType: BillingHistoryEventType;
  stripeEventId: string | null;
  note: string | null;
  createdAt: string;
};
