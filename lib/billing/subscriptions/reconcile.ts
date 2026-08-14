import "server-only";

import type Stripe from "stripe";

import { isPlanId } from "../plans/registry";
import type { PlanId } from "../plans/types";
import { resolvePlanIdFromStripePrice } from "../stripe/config";

import { applySubscriptionFromStripe, downgradeToFree } from "./service";
import { resolveUserSubscriptionDurable } from "./store";
import type { SubscriptionStatus, UserSubscriptionRecord } from "./types";

function periodIso(unixSeconds: number | null | undefined): string | null {
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1000).toISOString();
}

function isBlockingStripeStatus(status: Stripe.Subscription.Status): boolean {
  return (
    status === "active" ||
    status === "trialing" ||
    status === "past_due" ||
    status === "unpaid"
  );
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

export function resolvePlanFromStripeSubscription(
  subscription: Stripe.Subscription,
): PlanId | null {
  const metadataPlan = subscription.metadata?.planId;
  if (metadataPlan && isPlanId(metadataPlan)) return metadataPlan;
  const priceId = subscription.items.data[0]?.price?.id ?? null;
  return resolvePlanIdFromStripePrice(priceId);
}

function readPeriod(subscription: Stripe.Subscription): {
  start: string;
  end: string | null;
  cancelAtPeriodEnd: boolean;
} {
  const legacy = subscription as Stripe.Subscription & {
    current_period_start?: number;
    current_period_end?: number;
    cancel_at_period_end?: boolean;
  };
  const item = subscription.items.data[0] as
    | (Stripe.SubscriptionItem & {
        current_period_start?: number;
        current_period_end?: number;
      })
    | undefined;

  return {
    start:
      periodIso(legacy.current_period_start) ??
      periodIso(item?.current_period_start) ??
      new Date().toISOString(),
    end:
      periodIso(legacy.current_period_end) ??
      periodIso(item?.current_period_end),
    cancelAtPeriodEnd: Boolean(legacy.cancel_at_period_end),
  };
}

/**
 * Repair MINERVOT projection from Stripe contract facts.
 * Does not create, cancel, refund, or charge. Stripe list only.
 */
export async function reconcileProjectionFromStripeCustomer(input: {
  userId: string;
  stripe: Stripe;
  stripeCustomerId: string;
}): Promise<UserSubscriptionRecord> {
  const local = await resolveUserSubscriptionDurable(input.userId);

  let listed: Stripe.ApiList<Stripe.Subscription>;
  try {
    listed = await input.stripe.subscriptions.list({
      customer: input.stripeCustomerId,
      status: "all",
      limit: 20,
    });
  } catch (error) {
    console.warn("[billing] Stripe reconcile list failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return local;
  }

  const blocking = listed.data.filter((sub) =>
    isBlockingStripeStatus(sub.status),
  );

  if (blocking.length > 0) {
    const sub = blocking[0];
    const planId = resolvePlanFromStripeSubscription(sub);
    if (!planId || planId === "free") {
      return local;
    }

    const period = readPeriod(sub);
    const priceId = sub.items.data[0]?.price?.id ?? null;

    return applySubscriptionFromStripe({
      userId: input.userId,
      stripeCustomerId: input.stripeCustomerId,
      stripeSubscriptionId: sub.id,
      planId,
      status: mapSubscriptionStatus(sub.status),
      currentPeriodStart: period.start,
      currentPeriodEnd: period.end,
      cancelAtPeriodEnd: period.cancelAtPeriodEnd,
      stripePriceId: priceId,
    });
  }

  const localBlocking =
    local.planId !== "free" &&
    (local.status === "active" ||
      local.status === "trialing" ||
      local.status === "past_due" ||
      local.status === "unpaid");

  if (localBlocking) {
    return downgradeToFree(input.userId, { source: "stripe_webhook" });
  }

  return local;
}
