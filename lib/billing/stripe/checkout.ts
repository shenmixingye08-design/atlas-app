import "server-only";

import { randomUUID } from "crypto";

import type Stripe from "stripe";

import { getPlanDefinition, isPlanId } from "../plans/registry";
import type { PlanId } from "../plans/types";
import {
  getUserSubscription,
  saveUserSubscription,
} from "../subscriptions/store";

import { getStripeClient } from "./client";
import {
  getStripePriceIdForPlan,
  isStripeCheckoutReadyForPlan,
  isStripeConfigured,
  resolveAppOrigin,
  resolveCheckoutUrls,
  resolvePlanIdFromStripePrice,
} from "./config";

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

    const customerId = await findOrCreateStripeCustomer({
      stripe,
      userId: input.userId,
      customerEmail: input.customerEmail,
      existingCustomerId:
        input.existingStripeCustomerId ??
        getUserSubscription(input.userId)?.stripeCustomerId ??
        null,
    });
    rememberStripeCustomerId(input.userId, customerId);

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

export async function createBillingPortalSession(input: {
  stripeCustomerId: string;
  origin: string;
}): Promise<{ url: string; mode: "live" | "mock" }> {
  const stripe = getStripeClient();

  if (stripe) {
    const origin = resolveAppOrigin(input.origin);
    const session = await stripe.billingPortal.sessions.create({
      customer: input.stripeCustomerId,
      return_url: `${origin}/settings/billing`,
    });

    return { url: session.url, mode: "live" };
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

export function isStripeLiveMode(): boolean {
  return isStripeConfigured();
}
