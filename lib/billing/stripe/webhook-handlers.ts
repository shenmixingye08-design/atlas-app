import "server-only";

import type Stripe from "stripe";

import { recordBillingHistory } from "../history/service";
import {
  notifyOwnerPaymentFailed,
  notifyUserPaymentFailed,
} from "../notifications/service";
import { getPlanDefinition } from "../plans/registry";
import {
  notifyBillingPaymentSucceeded,
  notifyOwnerStripeWebhookFailed,
} from "@/lib/notifications/emitters";
import { resolveUserSubscription } from "../subscriptions/service";
import {
  findSubscriptionByStripeCustomerId,
  listUserSubscriptions,
} from "../subscriptions/store";
import {
  applyDowngradeFromWebhook,
  applyPaidPlanFromWebhook,
  schedulePaymentFailureGrace,
} from "../subscriptions/lifecycle";
import type { SubscriptionStatus } from "../subscriptions/types";
import { mapStripePlanId } from "./checkout";
import type { StripeWebhookEventType } from "./config";
import { getStripeClient } from "./client";
import { resolvePlanIdFromStripePrice } from "./config";
import { recordStripeWebhookLog } from "@/lib/owner/billing-webhook/telemetry";
import { recordAuditLogSafe } from "@/lib/owner/audit-log";

function mapSubscriptionStatus(
  status: Stripe.Subscription.Status,
): SubscriptionStatus {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "canceled":
      return "canceled";
    case "unpaid":
      return "unpaid";
    case "incomplete":
      return "incomplete";
    case "incomplete_expired":
      return "incomplete_expired";
    default:
      return "incomplete";
  }
}

function readSubscriptionPeriod(subscription: Stripe.Subscription): {
  currentPeriodStart: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
} {
  const legacy = subscription as Stripe.Subscription & {
    current_period_start?: number;
    current_period_end?: number;
    cancel_at_period_end?: boolean;
  };

  return {
    currentPeriodStart:
      periodIso(legacy.current_period_start) ?? new Date().toISOString(),
    currentPeriodEnd: periodIso(legacy.current_period_end),
    cancelAtPeriodEnd: Boolean(legacy.cancel_at_period_end),
  };
}

export type WebhookHandleResult = {
  handled: boolean;
  eventType: StripeWebhookEventType | string;
  message: string;
  userId: string | null;
  planId: string | null;
  success: boolean;
};

function periodIso(unixSeconds: number | null | undefined): string | null {
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1000).toISOString();
}

async function fetchStripeSubscription(
  subscriptionId: string,
): Promise<Stripe.Subscription | null> {
  const stripe = getStripeClient();
  if (!stripe) return null;

  try {
    return await stripe.subscriptions.retrieve(subscriptionId);
  } catch {
    return null;
  }
}

function resolvePriceIdFromSubscription(
  subscription: Stripe.Subscription,
): string | null {
  return subscription.items.data[0]?.price?.id ?? null;
}

function resolvePlanFromSubscription(
  subscription: Stripe.Subscription,
): ReturnType<typeof mapStripePlanId> {
  const metadataPlan = mapStripePlanId(subscription.metadata?.planId);
  if (metadataPlan) return metadataPlan;

  const priceId = resolvePriceIdFromSubscription(subscription);
  return resolvePlanIdFromStripePrice(priceId);
}

function logWebhookResult(input: {
  event: Stripe.Event;
  status: "success" | "failure" | "skipped";
  message: string;
  userId?: string | null;
  planId?: string | null;
}): WebhookHandleResult {
  recordStripeWebhookLog({
    stripeEventId: input.event.id,
    eventType: input.event.type,
    status: input.status,
    userId: input.userId ?? null,
    planId: input.planId ?? null,
    message: input.message,
  });

  if (input.status !== "skipped") {
    const type = input.event.type;
    let action = "plan_change";
    if (
      type === "invoice.paid" ||
      type === "invoice.payment_succeeded" ||
      type === "checkout.session.completed"
    ) {
      action = "stripe_payment";
    } else if (
      type === "customer.subscription.deleted" ||
      (type === "customer.subscription.updated" &&
        input.message.toLowerCase().includes("cancel"))
    ) {
      action = "stripe_cancel";
    } else if (type === "invoice.payment_failed") {
      action = "stripe_payment";
    }

    recordAuditLogSafe({
      userId: input.userId ?? null,
      category: "billing",
      action,
      targetId: input.planId ?? input.event.id,
      result: input.status === "success" ? "success" : "failure",
      reason: input.message.slice(0, 500),
    });
  }

  if (input.status === "failure") {
    notifyOwnerStripeWebhookFailed(
      `${input.event.type}: ${input.message}`,
    );
  }

  return {
    handled: input.status !== "skipped",
    eventType: input.event.type,
    message: input.message,
    userId: input.userId ?? null,
    planId: input.planId ?? null,
    success: input.status === "success",
  };
}

function saveBillingSnapshot(input: {
  userId: string;
  planId: NonNullable<ReturnType<typeof mapStripePlanId>>;
  status: SubscriptionStatus | "payment_failed" | "payment_succeeded" | "refunded";
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  eventType: StripeWebhookEventType;
  stripeEventId: string;
  note?: string | null;
}): void {
  recordBillingHistory({
    userId: input.userId,
    planId: input.planId,
    status: input.status,
    stripeCustomerId: input.stripeCustomerId,
    stripeSubscriptionId: input.stripeSubscriptionId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    cancelAtPeriodEnd: input.cancelAtPeriodEnd,
    eventType: input.eventType,
    stripeEventId: input.stripeEventId,
    note: input.note,
  });
}

function readInvoiceSubscriptionId(
  invoice: Stripe.Invoice,
): string | null {
  const legacy = invoice as Stripe.Invoice & {
    subscription?: string | Stripe.Subscription | null;
  };
  const subscriptionRef = legacy.subscription;
  return typeof subscriptionRef === "string"
    ? subscriptionRef
    : subscriptionRef?.id ?? null;
}

async function resolveUserIdFromInvoice(
  invoice: Stripe.Invoice,
): Promise<string | null> {
  const subscriptionId = readInvoiceSubscriptionId(invoice);

  if (subscriptionId) {
    const subscription = await fetchStripeSubscription(subscriptionId);
    if (subscription?.metadata?.userId) {
      return subscription.metadata.userId;
    }
  }

  const customerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : invoice.customer?.id ?? null;

  if (!customerId) return null;

  const match = await resolveUserSubscriptionByCustomerId(customerId);
  return match?.userId ?? null;
}

async function resolveUserSubscriptionByCustomerId(customerId: string) {
  const fromStore = await findSubscriptionByStripeCustomerId(customerId);
  if (fromStore) return fromStore;

  // Fallback for in-memory-only rows (tests / cold path before Supabase hydrate).
  return (
    listUserSubscriptions().find(
      (record) => record.stripeCustomerId === customerId,
    ) ?? null
  );
}

async function handleCheckoutCompleted(
  event: Stripe.Event,
): Promise<WebhookHandleResult> {
  const session = event.data.object as Stripe.Checkout.Session;
  const userId =
    session.client_reference_id ?? session.metadata?.userId ?? null;
  const planId = mapStripePlanId(session.metadata?.planId);

  if (!userId || !planId) {
    return logWebhookResult({
      event,
      status: "failure",
      message: "Missing userId or planId on checkout session",
      userId,
      planId,
    });
  }

  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? null;

  let periodStart = new Date().toISOString();
  let periodEnd: string | null = null;
  let cancelAtPeriodEnd = false;
  let status: SubscriptionStatus = "active";
  let stripePriceId: string | null = session.metadata?.priceId ?? null;

  if (subscriptionId) {
    const subscription = await fetchStripeSubscription(subscriptionId);
    if (subscription) {
      const period = readSubscriptionPeriod(subscription);
      periodStart = period.currentPeriodStart;
      periodEnd = period.currentPeriodEnd;
      cancelAtPeriodEnd = period.cancelAtPeriodEnd;
      status = mapSubscriptionStatus(subscription.status);
      stripePriceId =
        resolvePriceIdFromSubscription(subscription) ?? stripePriceId;
    }
  }

  applyPaidPlanFromWebhook({
    userId,
    stripeCustomerId: String(session.customer ?? ""),
    stripeSubscriptionId: subscriptionId ?? "",
    planId,
    status,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd,
    stripePriceId,
  });

  saveBillingSnapshot({
    userId,
    planId,
    status,
    stripeCustomerId: String(session.customer ?? ""),
    stripeSubscriptionId: subscriptionId,
    periodStart,
    periodEnd,
    cancelAtPeriodEnd,
    eventType: "checkout.session.completed",
    stripeEventId: event.id,
    note: "Checkout completed — plan applied",
  });

  return logWebhookResult({
    event,
    status: "success",
    message: "Checkout session completed — plan applied",
    userId,
    planId,
  });
}

async function handleSubscriptionUpsert(
  event: Stripe.Event,
): Promise<WebhookHandleResult> {
  const subscription = event.data.object as Stripe.Subscription;
  const userId = subscription.metadata.userId ?? null;
  const planId = resolvePlanFromSubscription(subscription);

  if (!userId || !planId) {
    return logWebhookResult({
      event,
      status: "failure",
      message: "Missing userId or planId on subscription",
      userId,
      planId,
    });
  }

  const period = readSubscriptionPeriod(subscription);
  const status = mapSubscriptionStatus(subscription.status);
  const stripePriceId = resolvePriceIdFromSubscription(subscription);

  applyPaidPlanFromWebhook({
    userId,
    stripeCustomerId: String(subscription.customer),
    stripeSubscriptionId: subscription.id,
    planId,
    status,
    currentPeriodStart: period.currentPeriodStart,
    currentPeriodEnd: period.currentPeriodEnd,
    cancelAtPeriodEnd: period.cancelAtPeriodEnd,
    stripePriceId,
  });

  saveBillingSnapshot({
    userId,
    planId,
    status,
    stripeCustomerId: String(subscription.customer),
    stripeSubscriptionId: subscription.id,
    periodStart: period.currentPeriodStart,
    periodEnd: period.currentPeriodEnd,
    cancelAtPeriodEnd: period.cancelAtPeriodEnd,
    eventType: event.type as StripeWebhookEventType,
    stripeEventId: event.id,
    note: "Subscription synced",
  });

  return logWebhookResult({
    event,
    status: "success",
    message: "Subscription synced",
    userId,
    planId,
  });
}

async function handleSubscriptionDeleted(
  event: Stripe.Event,
): Promise<WebhookHandleResult> {
  const subscription = event.data.object as Stripe.Subscription;
  const userId = subscription.metadata.userId ?? null;
  const previousPlan = resolvePlanFromSubscription(subscription);

  if (!userId) {
    return logWebhookResult({
      event,
      status: "failure",
      message: "Missing userId on deleted subscription",
    });
  }

  applyDowngradeFromWebhook(userId);

  saveBillingSnapshot({
    userId,
    planId: "free",
    status: "canceled",
    stripeCustomerId: String(subscription.customer),
    stripeSubscriptionId: subscription.id,
    periodStart: null,
    periodEnd: new Date().toISOString(),
    cancelAtPeriodEnd: false,
    eventType: "customer.subscription.deleted",
    stripeEventId: event.id,
    note: "Subscription deleted — downgraded to Free, automations suspended",
  });

  return logWebhookResult({
    event,
    status: "success",
    message: "Subscription deleted — downgraded to Free",
    userId,
    planId: previousPlan ?? "free",
  });
}

async function handleInvoicePaymentSucceeded(
  event: Stripe.Event,
): Promise<WebhookHandleResult> {
  const invoice = event.data.object as Stripe.Invoice;
  const userId = await resolveUserIdFromInvoice(invoice);

  if (!userId) {
    return logWebhookResult({
      event,
      status: "failure",
      message: "Could not resolve user for successful invoice payment",
    });
  }

  const subscriptionId = readInvoiceSubscriptionId(invoice);
  let planId = resolveUserSubscription(userId).planId;
  let status: SubscriptionStatus = "active";
  let stripeCustomerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : invoice.customer?.id ?? null;
  let stripeSubscriptionId = subscriptionId;
  let periodStart = resolveUserSubscription(userId).currentPeriodStart;
  let periodEnd = resolveUserSubscription(userId).currentPeriodEnd;
  let cancelAtPeriodEnd = resolveUserSubscription(userId).cancelAtPeriodEnd;
  let stripePriceId = resolveUserSubscription(userId).stripePriceId ?? null;

  if (subscriptionId) {
    const subscription = await fetchStripeSubscription(subscriptionId);
    if (subscription) {
      const resolvedPlan = resolvePlanFromSubscription(subscription);
      if (resolvedPlan) planId = resolvedPlan;
      const period = readSubscriptionPeriod(subscription);
      periodStart = period.currentPeriodStart;
      periodEnd = period.currentPeriodEnd;
      cancelAtPeriodEnd = period.cancelAtPeriodEnd;
      status = mapSubscriptionStatus(subscription.status);
      stripeCustomerId = String(subscription.customer);
      stripeSubscriptionId = subscription.id;
      stripePriceId = resolvePriceIdFromSubscription(subscription);

      if (resolvedPlan) {
        applyPaidPlanFromWebhook({
          userId,
          stripeCustomerId,
          stripeSubscriptionId,
          planId: resolvedPlan,
          status,
          currentPeriodStart: period.currentPeriodStart,
          currentPeriodEnd: period.currentPeriodEnd,
          cancelAtPeriodEnd: period.cancelAtPeriodEnd,
          stripePriceId,
        });
      }
    }
  }

  const plan = getPlanDefinition(planId);
  notifyBillingPaymentSucceeded(userId, plan.name);

  saveBillingSnapshot({
    userId,
    planId,
    status: "payment_succeeded",
    stripeCustomerId,
    stripeSubscriptionId,
    periodStart,
    periodEnd,
    cancelAtPeriodEnd,
    eventType:
      event.type === "invoice.paid"
        ? "invoice.paid"
        : "invoice.payment_succeeded",
    stripeEventId: event.id,
    note: "Invoice payment succeeded",
  });

  return logWebhookResult({
    event,
    status: "success",
    message: "Invoice payment succeeded",
    userId,
    planId,
  });
}

async function handleInvoicePaymentFailed(
  event: Stripe.Event,
): Promise<WebhookHandleResult> {
  const invoice = event.data.object as Stripe.Invoice;
  const userId = await resolveUserIdFromInvoice(invoice);

  if (!userId) {
    return logWebhookResult({
      event,
      status: "failure",
      message: "Could not resolve user for failed invoice payment",
    });
  }

  const subscription = resolveUserSubscription(userId);
  schedulePaymentFailureGrace(userId);
  notifyUserPaymentFailed(userId);
  notifyOwnerPaymentFailed(userId);

  saveBillingSnapshot({
    userId,
    planId: subscription.planId,
    status: "payment_failed",
    stripeCustomerId:
      typeof invoice.customer === "string"
        ? invoice.customer
        : invoice.customer?.id ?? null,
    stripeSubscriptionId: readInvoiceSubscriptionId(invoice),
    periodStart: subscription.currentPeriodStart,
    periodEnd: subscription.currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    eventType: "invoice.payment_failed",
    stripeEventId: event.id,
    note: "Payment failed — 7-day grace scheduled",
  });

  return logWebhookResult({
    event,
    status: "success",
    message: "Invoice payment failed — notifications sent",
    userId,
    planId: subscription.planId,
  });
}

async function handleChargeRefunded(
  event: Stripe.Event,
): Promise<WebhookHandleResult> {
  const charge = event.data.object as Stripe.Charge;
  const customerId =
    typeof charge.customer === "string"
      ? charge.customer
      : charge.customer?.id ?? null;

  if (!customerId) {
    return logWebhookResult({
      event,
      status: "skipped",
      message: "Refund charge has no customer — nothing to sync",
    });
  }

  const match = await resolveUserSubscriptionByCustomerId(customerId);
  if (!match) {
    return logWebhookResult({
      event,
      status: "skipped",
      message: "Refund customer not linked to an ATLAS user",
    });
  }

  // Record only — plan changes still come from subscription.deleted / Dashboard cancel.
  // Auto-downgrade on refund would surprise operators who refund without canceling.
  saveBillingSnapshot({
    userId: match.userId,
    planId: match.planId,
    status: "refunded",
    stripeCustomerId: customerId,
    stripeSubscriptionId: match.stripeSubscriptionId,
    periodStart: match.currentPeriodStart,
    periodEnd: match.currentPeriodEnd,
    cancelAtPeriodEnd: match.cancelAtPeriodEnd,
    eventType: "charge.refunded",
    stripeEventId: event.id,
    note: `Refund recorded (amount=${charge.amount_refunded}/${charge.amount})`,
  });

  return logWebhookResult({
    event,
    status: "success",
    message: "Charge refund recorded in billing history",
    userId: match.userId,
    planId: match.planId,
  });
}

export async function handleStripeWebhookEvent(
  event: Stripe.Event,
): Promise<WebhookHandleResult> {
  switch (event.type) {
    case "checkout.session.completed":
      return handleCheckoutCompleted(event);
    case "customer.subscription.created":
    case "customer.subscription.updated":
      return handleSubscriptionUpsert(event);
    case "customer.subscription.deleted":
      return handleSubscriptionDeleted(event);
    case "invoice.paid":
    case "invoice.payment_succeeded":
      return handleInvoicePaymentSucceeded(event);
    case "invoice.payment_failed":
      return handleInvoicePaymentFailed(event);
    case "charge.refunded":
      return handleChargeRefunded(event);
    default:
      return logWebhookResult({
        event,
        status: "skipped",
        message: "Unhandled event",
      });
  }
}
