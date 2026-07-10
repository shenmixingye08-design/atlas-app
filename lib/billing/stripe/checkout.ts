import "server-only";

import { randomUUID } from "crypto";

import { getPlanDefinition, isPlanId } from "../plans/registry";
import type { PlanId } from "../plans/types";

import { getStripeClient } from "./client";
import {
  getStripePriceIdForPlan,
  isStripeCheckoutReadyForPlan,
  isStripeConfigured,
  resolveAppOrigin,
  resolveCheckoutUrls,
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

export async function createCheckoutSession(input: {
  userId: string;
  planId: PlanId;
  customerEmail?: string | null;
  origin: string;
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
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: input.userId,
      customer_email: input.customerEmail ?? undefined,
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
