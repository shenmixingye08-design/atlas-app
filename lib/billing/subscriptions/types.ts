import type { PlanId, Timestamp } from "../plans/types";

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "incomplete_expired";

/** Persisted subscription record per Clerk user. */
export type UserSubscriptionRecord = {
  userId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  planId: PlanId;
  status: SubscriptionStatus;
  currentPeriodStart: Timestamp | null;
  currentPeriodEnd: Timestamp | null;
  cancelAtPeriodEnd: boolean;
  updatedAt: Timestamp;
  /** Set when subscription ends — blocks automation runs. */
  automationsSuspended?: boolean;
  /** Grace period end after payment failure before automation stop. */
  paymentFailureGraceEndsAt?: Timestamp | null;
  /** Last server-side plan profile sync from Stripe webhook. */
  planProfileSyncedAt?: Timestamp | null;
};

export type UserSubscriptionView = UserSubscriptionRecord & {
  planName: string;
  isPaid: boolean;
};
