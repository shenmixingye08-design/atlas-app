import type { PlanId } from "../plans/types";

export const STRIPE_CHECKOUT_SUCCESS_PATH = "/billing/success";
export const STRIPE_CHECKOUT_CANCEL_PATH = "/billing/cancel";

export type StripeWebhookEventType =
  | "checkout.session.completed"
  | "customer.subscription.created"
  | "customer.subscription.updated"
  | "customer.subscription.deleted"
  | "invoice.paid"
  | "invoice.payment_succeeded"
  | "invoice.payment_failed"
  | "charge.refunded";

export const HANDLED_STRIPE_EVENTS: readonly StripeWebhookEventType[] = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
  "charge.refunded",
];

export function getStripeSecretKey(): string | null {
  const value = process.env.STRIPE_SECRET_KEY?.trim();
  return value || null;
}

export function getStripePublishableKey(): string | null {
  const value = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim();
  return value || null;
}

export function getStripeWebhookSecret(): string | null {
  const value = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  return value || null;
}

export function getConfiguredAppUrl(): string | null {
  const value =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "";
  if (value) return value.replace(/\/$/, "");

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  }

  return null;
}

/** Prefer configured public URL; fall back to the incoming request origin. */
export function resolveAppOrigin(fallbackOrigin: string): string {
  return getConfiguredAppUrl() ?? fallbackOrigin.replace(/\/$/, "");
}

export function isStripeConfigured(): boolean {
  return Boolean(getStripeSecretKey() && getStripePublishableKey());
}

export function isStripeCheckoutReadyForPlan(planId: PlanId): boolean {
  if (planId === "free") return false;
  return Boolean(getStripeSecretKey() && getStripePriceIdForPlan(planId));
}

export function getStripePriceIdForPlan(planId: PlanId): string | null {
  const envKey = `STRIPE_PRICE_${planId.toUpperCase()}` as
    | "STRIPE_PRICE_FREE"
    | "STRIPE_PRICE_LIGHT"
    | "STRIPE_PRICE_STANDARD"
    | "STRIPE_PRICE_PREMIUM";

  return process.env[envKey]?.trim() || null;
}

const PAID_PLAN_IDS = ["light", "standard", "premium"] as const;

export function resolvePlanIdFromStripePrice(
  priceId: string | null | undefined,
): PlanId | null {
  if (!priceId) return null;

  for (const planId of PAID_PLAN_IDS) {
    if (getStripePriceIdForPlan(planId) === priceId) {
      return planId;
    }
  }

  return null;
}

export function resolveCheckoutUrls(origin: string): {
  successUrl: string;
  cancelUrl: string;
} {
  return {
    successUrl: `${origin}${STRIPE_CHECKOUT_SUCCESS_PATH}?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${origin}${STRIPE_CHECKOUT_CANCEL_PATH}`,
  };
}
