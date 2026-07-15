import "server-only";

import type Stripe from "stripe";

import { mapStripePlanId } from "./checkout";
import { getStripeClient } from "./client";
import { resolvePlanIdFromStripePrice } from "./config";
import { applyPaidPlanFromWebhook } from "../subscriptions/lifecycle";
import { resolveUserSubscription } from "../subscriptions/service";
import { resolveUserSubscriptionDurable } from "../subscriptions/store";
import type { SubscriptionStatus } from "../subscriptions/types";
import { isPlanId } from "../plans/registry";
import type { PlanId } from "../plans/types";

function periodIso(unixSeconds: number | null | undefined): string | null {
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1000).toISOString();
}

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * After Stripe redirects to /billing/success, verify the Checkout Session belongs
 * to this user and ensure plan state is synced (webhook may be slightly delayed).
 * Never logs secrets or full payment method details.
 */
export async function finalizeCheckoutSessionForUser(input: {
  userId: string;
  sessionId: string;
}): Promise<{ planId: PlanId | null; synced: boolean }> {
  const stripe = getStripeClient();
  if (!stripe) {
    return { planId: null, synced: false };
  }

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(input.sessionId, {
      expand: ["subscription"],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "retrieve failed";
    console.error("[billing] checkout session retrieve failed", {
      sessionIdPrefix: input.sessionId.slice(0, 12),
      message: message.slice(0, 200),
    });
    return { planId: null, synced: false };
  }

  const sessionUserId =
    session.client_reference_id ?? session.metadata?.userId ?? null;
  if (!sessionUserId || sessionUserId !== input.userId) {
    console.error("[billing] checkout session user mismatch", {
      sessionIdPrefix: input.sessionId.slice(0, 12),
    });
    return { planId: null, synced: false };
  }

  const paid =
    session.payment_status === "paid" ||
    session.status === "complete" ||
    session.payment_status === "no_payment_required";

  if (!paid) {
    return { planId: null, synced: false };
  }

  let planId: PlanId | null =
    mapStripePlanId(session.metadata?.planId) ??
    (session.metadata?.planId && isPlanId(session.metadata.planId)
      ? session.metadata.planId
      : null);

  const subscriptionRef = session.subscription;
  const subscription =
    typeof subscriptionRef === "object" && subscriptionRef && "id" in subscriptionRef
      ? (subscriptionRef as Stripe.Subscription)
      : typeof subscriptionRef === "string"
        ? await stripe.subscriptions.retrieve(subscriptionRef)
        : null;

  if (!planId && subscription) {
    const priceId = subscription.items.data[0]?.price?.id ?? null;
    planId =
      mapStripePlanId(subscription.metadata?.planId) ??
      resolvePlanIdFromStripePrice(priceId);
  }

  if (planId && subscription) {
    const priceId = subscription.items.data[0]?.price?.id ?? null;
    const legacy = subscription as Stripe.Subscription & {
      current_period_start?: number;
      current_period_end?: number;
      cancel_at_period_end?: boolean;
    };

    applyPaidPlanFromWebhook({
      userId: input.userId,
      stripeCustomerId: String(session.customer ?? ""),
      stripeSubscriptionId: subscription.id,
      planId,
      status: mapSubscriptionStatus(subscription.status),
      currentPeriodStart:
        periodIso(legacy.current_period_start) ?? new Date().toISOString(),
      currentPeriodEnd: periodIso(legacy.current_period_end),
      cancelAtPeriodEnd: Boolean(legacy.cancel_at_period_end),
      stripePriceId: priceId,
    });
  }

  // Brief wait for webhook race (best-effort; sync above is the safety net).
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await resolveUserSubscriptionDurable(input.userId);
    const current = resolveUserSubscription(input.userId);
    if (planId && current.planId === planId) {
      return { planId, synced: true };
    }
    if (!planId && current.planId !== "free") {
      return { planId: current.planId, synced: true };
    }
    await sleep(400);
  }

  const finalPlan = resolveUserSubscription(input.userId).planId;
  return {
    planId: planId ?? (finalPlan !== "free" ? finalPlan : null),
    synced: Boolean(planId || finalPlan !== "free"),
  };
}
