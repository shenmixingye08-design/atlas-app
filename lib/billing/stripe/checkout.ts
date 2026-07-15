import "server-only";

import { randomUUID } from "crypto";

import type Stripe from "stripe";

import { getPlanDefinition, isPlanId } from "../plans/registry";
import type { PlanId } from "../plans/types";
import { isPaidCapableStatus } from "../subscriptions/service";
import {
  getUserSubscription,
  resolveUserSubscriptionDurable,
  saveUserSubscription,
} from "../subscriptions/store";
import type { UserSubscriptionRecord } from "../subscriptions/types";

import { getStripeClient } from "./client";
import {
  getStripePriceIdForPlan,
  isStripeCheckoutReadyForPlan,
  isStripeConfigured,
  resolveAppOrigin,
  resolveCheckoutUrls,
  resolvePlanIdFromStripePrice,
} from "./config";
import {
  CHECKOUT_ALREADY_SAME_PLAN_MESSAGE,
  CHECKOUT_PRICE_MISMATCH_MESSAGE,
  CHECKOUT_USE_PORTAL_FOR_PLAN_CHANGE_MESSAGE,
  CheckoutBlockedError,
} from "./errors";
import {
  assertStripeSafeForProduction,
  usesStripeLiveSecretKey,
} from "./production-guard";
import { isAtlasProduction } from "@/lib/runtime/is-production";

export type CheckoutSessionResult = {
  sessionId: string;
  url: string;
  mode: "live" | "mock";
  planId: PlanId;
};

function assertCheckoutPriceConfigured(planId: PlanId, priceId: string | null): void {
  if (!getStripeClient()) return;

  if (!priceId) {
    throw new Error(`Stripe price is not configured for plan: ${planId}`);
  }
}

/** Only server-configured Price IDs may be used for Checkout. */
export function assertAllowedStripePriceId(priceId: string, planId: PlanId): void {
  const expected = getStripePriceIdForPlan(planId);
  if (!expected || expected !== priceId) {
    throw new Error(`Stripe price is not allowed for plan: ${planId}`);
  }
  if (!resolvePlanIdFromStripePrice(priceId)) {
    throw new Error("Stripe price is not in the allowlist");
  }
}

/**
 * Verify Stripe Price matches ATLAS plan amount.
 * JPY is a zero-decimal currency in Stripe → unit_amount === yen (980, not 98000).
 */
export async function assertStripePriceMatchesPlan(
  stripe: Stripe,
  priceId: string,
  planId: PlanId,
): Promise<void> {
  console.error("[billing] assertStripePriceMatchesPlan enter", { priceId, planId });
  const plan = getPlanDefinition(planId);
  let price: Stripe.Price | undefined;

  const logPriceMismatchDebug = () => {
    const fields = {
      stripePriceId: price?.id ?? priceId,
      stripeAmount: price?.unit_amount ?? null,
      stripeCurrency: price?.currency ?? null,
      stripeInterval: price?.recurring?.interval ?? null,
      expectedAmount: plan.monthlyPriceJpy,
    };
    console.error(fields);
    console.error(
      "[billing] price_mismatch debug " + JSON.stringify(fields),
    );
  };

  try {
    price = await stripe.prices.retrieve(priceId);
  } catch {
    logPriceMismatchDebug();
    throw new CheckoutBlockedError(
      "price_mismatch",
      CHECKOUT_PRICE_MISMATCH_MESSAGE,
    );
  }

  const currency = price.currency.toLowerCase();
  if (currency !== "jpy") {
    console.error(
      `[billing] Stripe price currency mismatch for ${planId}: expected jpy, got ${currency}`,
    );
    logPriceMismatchDebug();
    throw new CheckoutBlockedError(
      "price_mismatch",
      CHECKOUT_PRICE_MISMATCH_MESSAGE,
    );
  }

  // Fail closed: unit_amount must equal monthlyPriceJpy for JPY.
  if (price.unit_amount == null || price.unit_amount !== plan.monthlyPriceJpy) {
    console.error(
      `[billing] Stripe price amount mismatch for ${planId}: expected ${plan.monthlyPriceJpy}, got ${price.unit_amount}`,
    );
    logPriceMismatchDebug();
    throw new CheckoutBlockedError(
      "price_mismatch",
      CHECKOUT_PRICE_MISMATCH_MESSAGE,
    );
  }

  if (price.type === "recurring" && price.recurring?.interval !== "month") {
    console.error(
      `[billing] Stripe price interval mismatch for ${planId}: expected month`,
    );
    logPriceMismatchDebug();
    throw new CheckoutBlockedError(
      "price_mismatch",
      CHECKOUT_PRICE_MISMATCH_MESSAGE,
    );
  }
}

function isBlockingSubscriptionStatus(
  status: UserSubscriptionRecord["status"],
): boolean {
  return (
    isPaidCapableStatus(status) ||
    status === "past_due" ||
    status === "unpaid"
  );
}

function resolvePlanFromStripeSubscription(
  subscription: Stripe.Subscription,
): PlanId | null {
  const metadataPlan = subscription.metadata?.planId;
  if (metadataPlan && isPlanId(metadataPlan)) return metadataPlan;

  const priceId = subscription.items.data[0]?.price?.id ?? null;
  return resolvePlanIdFromStripePrice(priceId);
}

/**
 * Reject duplicate Checkout when the user already has an active paid sub.
 * Prefer Billing Portal for plan changes (safer than accidental double subs).
 */
export async function assertNoDuplicatePaidSubscription(input: {
  userId: string;
  planId: PlanId;
  stripe: Stripe | null;
  stripeCustomerId?: string | null;
}): Promise<void> {
  const local = await resolveUserSubscriptionDurable(input.userId);
  if (
    local.planId !== "free" &&
    isBlockingSubscriptionStatus(local.status)
  ) {
    if (local.planId === input.planId) {
      throw new CheckoutBlockedError(
        "already_same_plan",
        CHECKOUT_ALREADY_SAME_PLAN_MESSAGE,
      );
    }
    throw new CheckoutBlockedError(
      "use_portal_for_plan_change",
      CHECKOUT_USE_PORTAL_FOR_PLAN_CHANGE_MESSAGE,
    );
  }

  const customerId = input.stripeCustomerId ?? local.stripeCustomerId;
  if (!input.stripe || !customerId) return;

  try {
    const listed = await input.stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 20,
    });

    const blocking = listed.data.filter(
      (sub) =>
        sub.status === "active" ||
        sub.status === "trialing" ||
        sub.status === "past_due" ||
        sub.status === "unpaid",
    );

    for (const sub of blocking) {
      const existingPlan = resolvePlanFromStripeSubscription(sub);
      if (existingPlan === input.planId) {
        throw new CheckoutBlockedError(
          "already_same_plan",
          CHECKOUT_ALREADY_SAME_PLAN_MESSAGE,
        );
      }
      if (existingPlan && existingPlan !== "free") {
        throw new CheckoutBlockedError(
          "use_portal_for_plan_change",
          CHECKOUT_USE_PORTAL_FOR_PLAN_CHANGE_MESSAGE,
        );
      }
      // Unknown price mapping but still a live Stripe sub — block to be safe.
      throw new CheckoutBlockedError(
        "use_portal_for_plan_change",
        CHECKOUT_USE_PORTAL_FOR_PLAN_CHANGE_MESSAGE,
      );
    }
  } catch (error) {
    if (error instanceof CheckoutBlockedError) throw error;
    console.warn(
      "[billing] Stripe subscription list failed during duplicate check:",
      error instanceof Error ? error.message : "unknown",
    );
  }
}

async function findOrCreateStripeCustomer(input: {
  stripe: Stripe;
  userId: string;
  customerEmail?: string | null;
  existingCustomerId?: string | null;
}): Promise<string> {
  const { stripe, userId, customerEmail, existingCustomerId } = input;

  if (existingCustomerId) {
    try {
      const existing = await stripe.customers.retrieve(existingCustomerId);
      if (!("deleted" in existing && existing.deleted)) {
        return existing.id;
      }
    } catch {
      // Stale ID — create or look up below.
    }
  }

  if (customerEmail) {
    const listed = await stripe.customers.list({
      email: customerEmail,
      limit: 10,
    });
    const owned = listed.data.find(
      (customer) => customer.metadata?.userId === userId,
    );
    if (owned) return owned.id;
  }

  const created = await stripe.customers.create({
    email: customerEmail ?? undefined,
    metadata: { userId },
  });

  return created.id;
}

function rememberStripeCustomerId(userId: string, stripeCustomerId: string): void {
  const current = getUserSubscription(userId);
  if (current?.stripeCustomerId === stripeCustomerId) return;

  const now = new Date().toISOString();
  saveUserSubscription({
    ...(current ?? {
      userId,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripePriceId: null,
      planId: "free" as PlanId,
      status: "active" as const,
      currentPeriodStart: now,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      updatedAt: now,
    }),
    userId,
    stripeCustomerId,
    updatedAt: now,
  });
}

export async function createCheckoutSession(input: {
  userId: string;
  planId: PlanId;
  customerEmail?: string | null;
  origin: string;
  existingStripeCustomerId?: string | null;
}): Promise<CheckoutSessionResult> {
  assertStripeSafeForProduction();

  const plan = getPlanDefinition(input.planId);

  if (plan.monthlyPriceJpy <= 0) {
    throw new Error("Free plan does not require checkout");
  }

  const origin = resolveAppOrigin(input.origin);
  const priceId = getStripePriceIdForPlan(input.planId);
  assertCheckoutPriceConfigured(input.planId, priceId);

  const stripe = getStripeClient();

  if (stripe && priceId && isStripeCheckoutReadyForPlan(input.planId)) {
    assertAllowedStripePriceId(priceId, input.planId);
    await assertStripePriceMatchesPlan(stripe, priceId, input.planId);

    const customerId = await findOrCreateStripeCustomer({
      stripe,
      userId: input.userId,
      customerEmail: input.customerEmail,
      existingCustomerId:
        input.existingStripeCustomerId ??
        (await resolveUserSubscriptionDurable(input.userId)).stripeCustomerId ??
        null,
    });
    rememberStripeCustomerId(input.userId, customerId);

    await assertNoDuplicatePaidSubscription({
      userId: input.userId,
      planId: input.planId,
      stripe,
      stripeCustomerId: customerId,
    });

    const { successUrl, cancelUrl } = resolveCheckoutUrls(origin);
    const metadata: Record<string, string> = {
      userId: input.userId,
      planId: input.planId,
      priceId,
    };

    if (input.customerEmail) {
      metadata.customerEmail = input.customerEmail;
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: input.userId,
      metadata,
      subscription_data: {
        metadata: {
          userId: input.userId,
          planId: input.planId,
          priceId,
        },
      },
    });

    if (!session.url) {
      throw new Error("Stripe did not return a checkout URL");
    }

    return {
      sessionId: session.id,
      url: session.url,
      mode: "live",
      planId: input.planId,
    };
  }

  if (isStripeConfigured()) {
    throw new Error(`Stripe checkout is not ready for plan: ${input.planId}`);
  }

  if (isAtlasProduction()) {
    throw new Error(
      "Stripe is not configured for production checkout. Set STRIPE_SECRET_KEY, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, and STRIPE_PRICE_*.",
    );
  }

  // Local/dev mock still checks durable local state for duplicate guidance.
  await assertNoDuplicatePaidSubscription({
    userId: input.userId,
    planId: input.planId,
    stripe: null,
    stripeCustomerId: input.existingStripeCustomerId ?? null,
  });

  const mockSessionId = `mock_cs_${randomUUID()}`;
  const mockUrl = new URL("/billing/success", origin);
  mockUrl.searchParams.set("session_id", mockSessionId);
  mockUrl.searchParams.set("plan", input.planId);
  mockUrl.searchParams.set("mode", "mock");

  return {
    sessionId: mockSessionId,
    url: mockUrl.toString(),
    mode: "mock",
    planId: input.planId,
  };
}

/**
 * Opens Stripe Customer Portal for the authenticated user's own customer ID.
 * Card change / invoices / cancel / plan change are Portal Dashboard features —
 * the app only creates a portal session; it does not collect card data.
 */
export async function createBillingPortalSession(input: {
  stripeCustomerId: string;
  origin: string;
}): Promise<{ url: string; mode: "live" | "mock" }> {
  assertStripeSafeForProduction();

  const stripe = getStripeClient();

  if (stripe) {
    const origin = resolveAppOrigin(input.origin);
    const session = await stripe.billingPortal.sessions.create({
      customer: input.stripeCustomerId,
      return_url: `${origin}/settings/billing`,
    });

    return { url: session.url, mode: "live" };
  }

  if (isAtlasProduction()) {
    throw new Error(
      "Stripe is not configured for production billing portal. Set STRIPE_SECRET_KEY.",
    );
  }

  return {
    url: `${input.origin}/settings/billing?portal=mock`,
    mode: "mock",
  };
}

export function mapStripePlanId(value: string | null | undefined): PlanId | null {
  if (!value || !isPlanId(value)) return null;
  return value;
}

/** True when the configured secret key is live mode (sk_live_). */
export function isStripeLiveMode(): boolean {
  return usesStripeLiveSecretKey();
}
