import "server-only";

import { randomUUID } from "crypto";

import type { PlanId } from "../plans/types";
import type { SubscriptionStatus } from "../subscriptions/types";
import { HANDLED_STRIPE_EVENTS, type StripeWebhookEventType } from "../stripe/config";

import { appendBillingHistoryRecord } from "./store";
import type { BillingHistoryEventType, BillingHistoryRecord } from "./types";

export function recordBillingHistory(input: {
  userId: string;
  planId: PlanId;
  status: SubscriptionStatus | "payment_failed" | "payment_succeeded" | "refunded";
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  eventType: BillingHistoryEventType;
  stripeEventId?: string | null;
  note?: string | null;
}): BillingHistoryRecord {
  return appendBillingHistoryRecord({
    id: `bh_${randomUUID()}`,
    userId: input.userId,
    planId: input.planId,
    status: input.status,
    stripeCustomerId: input.stripeCustomerId ?? null,
    stripeSubscriptionId: input.stripeSubscriptionId ?? null,
    periodStart: input.periodStart ?? null,
    periodEnd: input.periodEnd ?? null,
    cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
    eventType: input.eventType,
    stripeEventId: input.stripeEventId ?? null,
    note: input.note ?? null,
    createdAt: new Date().toISOString(),
  });
}

export type { BillingHistoryRecord } from "./types";

export function isStripeWebhookEventType(
  value: string,
): value is StripeWebhookEventType {
  return (HANDLED_STRIPE_EVENTS as readonly string[]).includes(value);
}
