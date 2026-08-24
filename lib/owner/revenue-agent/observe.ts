import "server-only";

import type Stripe from "stripe";

import {
  attributedContentForUser,
  buildVisitorUserLink,
  canCountSignup,
} from "./attribution";
import { REVENUE_AGENT_CAMPAIGN_ID } from "./constants";
import { ensureRevenueAgentHydrated } from "./durable";
import {
  checkoutStartedDedupeKey,
  contentLifecycleDedupeKey,
  firstAutomationDedupeKey,
  firstJobDedupeKey,
  invoicePaidDedupeKey,
  refundDedupeKey,
  signupDedupeKey,
  subscriptionCanceledDedupeKey,
  subscriptionStartedDedupeKey,
} from "./events";
import { recordRevenueEvent } from "./record";
import {
  getRevenueVisitor,
  listRevenueEvents,
  listVisitorUserLinks,
  upsertVisitorUserLink,
} from "./store";

export function observeRevenueSafe(work: () => Promise<void>): void {
  void work().catch((error) => {
    console.warn(
      "[revenue-agent] observer failed (billing/entitlement unchanged):",
      error instanceof Error ? error.message : "unknown",
    );
  });
}

async function attributedLink(userId: string) {
  await ensureRevenueAgentHydrated();
  return attributedContentForUser(listVisitorUserLinks(), userId);
}

export async function observeSignupBind(input: {
  userId: string;
  visitorId: string | null;
  clerkCreatedAtMs: number | null;
}): Promise<{ attributed: boolean; reason?: string }> {
  await ensureRevenueAgentHydrated();
  if (!input.visitorId) {
    return { attributed: false, reason: "no_visitor" };
  }
  const visitor = getRevenueVisitor(input.visitorId);
  if (!visitor) {
    return { attributed: false, reason: "unknown_visitor" };
  }
  const link = buildVisitorUserLink({ visitor, userId: input.userId });
  upsertVisitorUserLink(link);
  const decision = canCountSignup({
    userId: input.userId,
    clerkCreatedAtMs: input.clerkCreatedAtMs,
    existingEvents: listRevenueEvents(),
    link,
  });
  if (!decision.ok) {
    return { attributed: false, reason: decision.reason };
  }
  recordRevenueEvent({
    eventName: "signup_completed",
    dedupeKey: signupDedupeKey(input.userId),
    userId: input.userId,
    anonymousVisitorId: input.visitorId,
    campaignId: link.attributedCampaignId ?? REVENUE_AGENT_CAMPAIGN_ID,
    contentId: decision.contentId,
    source: link.source,
    medium: link.medium,
  });
  return { attributed: true };
}

export async function observeFirstJobCompleted(userId: string): Promise<void> {
  const link = await attributedLink(userId);
  if (!link) return;
  recordRevenueEvent({
    eventName: "first_job_completed",
    dedupeKey: firstJobDedupeKey(userId),
    userId,
    campaignId: link.attributedCampaignId,
    contentId: link.attributedContentId,
    source: link.source,
    medium: link.medium,
  });
}

export async function observeFirstAutomationCompleted(userId: string): Promise<void> {
  const link = await attributedLink(userId);
  if (!link) return;
  recordRevenueEvent({
    eventName: "first_automation_completed",
    dedupeKey: firstAutomationDedupeKey(userId),
    userId,
    campaignId: link.attributedCampaignId,
    contentId: link.attributedContentId,
    source: link.source,
    medium: link.medium,
  });
}

export async function observeCheckoutStarted(input: {
  userId: string;
  sessionId: string;
  livemode: boolean | null;
}): Promise<void> {
  const link = await attributedLink(input.userId);
  recordRevenueEvent({
    eventName: "checkout_started",
    dedupeKey: checkoutStartedDedupeKey(input.userId, input.sessionId),
    userId: input.userId,
    campaignId: link?.attributedCampaignId ?? null,
    contentId: link?.attributedContentId ?? null,
    source: link?.source ?? null,
    medium: link?.medium ?? null,
    metadata: {
      livemode: input.livemode,
    },
  });
}

function yenFromStripeAmount(
  amount: number | null | undefined,
  currency: string | null | undefined,
): number | null {
  if (amount == null || !Number.isFinite(amount)) return null;
  if ((currency ?? "jpy").toLowerCase() !== "jpy") return null;
  return amount;
}

export async function observeStripeRevenueEvent(input: {
  eventId: string;
  eventType: string;
  livemode: boolean | null;
  userId: string | null;
  object: unknown;
}): Promise<void> {
  const userId = input.userId;
  if (!userId) return;
  await ensureRevenueAgentHydrated();
  const link = attributedContentForUser(listVisitorUserLinks(), userId);
  const common = {
    userId,
    campaignId: link?.attributedCampaignId ?? null,
    contentId: link?.attributedContentId ?? null,
    source: link?.source ?? null,
    medium: link?.medium ?? null,
    metadata: {
      livemode: input.livemode,
      stripeEventId: input.eventId,
    },
  };

  if (input.eventType === "checkout.session.completed") {
    const session = input.object as Stripe.Checkout.Session;
    const subscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id ?? "unknown";
    recordRevenueEvent({
      ...common,
      eventName: "subscription_started",
      dedupeKey: subscriptionStartedDedupeKey(userId, subscriptionId),
      metadata: {
        ...common.metadata,
        subscriptionId,
      },
    });
    observeRevenueSafe(async () => {
      const { handleRevenueMaxAction } = await import(
        "@/lib/growth/revenue-max/service"
      );
      await handleRevenueMaxAction(userId, {
        action: "checkout_completed",
        sessionId: session.id,
      });
    });
    observeRevenueSafe(async () => {
      const { recordDiagnosisPaidIfBound } = await import(
        "@/lib/growth/acquisition/service"
      );
      await recordDiagnosisPaidIfBound(userId);
    });
    return;
  }

  if (input.eventType === "customer.subscription.created") {
    const subscription = input.object as Stripe.Subscription;
    recordRevenueEvent({
      ...common,
      eventName: "subscription_started",
      dedupeKey: subscriptionStartedDedupeKey(userId, subscription.id),
      metadata: {
        ...common.metadata,
        subscriptionId: subscription.id,
      },
    });
    return;
  }

  if (
    input.eventType === "invoice.paid" ||
    input.eventType === "invoice.payment_succeeded"
  ) {
    const invoice = input.object as Stripe.Invoice;
    recordRevenueEvent({
      ...common,
      eventName: "invoice_paid",
      dedupeKey: invoicePaidDedupeKey(input.eventId),
      metadata: {
        ...common.metadata,
        invoiceId: invoice.id ?? null,
        amountYen: yenFromStripeAmount(invoice.amount_paid, invoice.currency),
        currency: invoice.currency ?? null,
      },
    });
    return;
  }

  if (input.eventType === "customer.subscription.deleted") {
    const subscription = input.object as Stripe.Subscription;
    recordRevenueEvent({
      ...common,
      eventName: "subscription_canceled",
      dedupeKey: subscriptionCanceledDedupeKey(userId, subscription.id),
      metadata: {
        ...common.metadata,
        subscriptionId: subscription.id,
      },
    });
    observeRevenueSafe(async () => {
      const { handleRevenueMaxAction } = await import(
        "@/lib/growth/revenue-max/service"
      );
      await handleRevenueMaxAction(userId, {
        action: "cancellation_completed",
        subscriptionId: subscription.id,
      });
    });
    return;
  }

  if (input.eventType === "charge.refunded") {
    const charge = input.object as Stripe.Charge;
    recordRevenueEvent({
      ...common,
      eventName: "refund_recorded",
      dedupeKey: refundDedupeKey(input.eventId),
      metadata: {
        ...common.metadata,
        amountYen: yenFromStripeAmount(charge.amount_refunded, charge.currency),
        currency: charge.currency ?? null,
      },
    });
  }
}

export function recordContentLifecycle(
  eventName: "content_created" | "content_approved" | "content_published",
  contentId: string,
  extra?: { campaignId?: string | null; source?: string | null },
): void {
  recordRevenueEvent({
    eventName,
    dedupeKey: contentLifecycleDedupeKey(eventName, contentId),
    contentId,
    campaignId: extra?.campaignId ?? REVENUE_AGENT_CAMPAIGN_ID,
    source: extra?.source ?? "x",
    medium: "social",
  });
}
