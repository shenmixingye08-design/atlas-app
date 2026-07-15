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

/**
 * Runtime-only env read — avoid static `process.env.STRIPE_*` member access so
 * bundlers cannot replace the binding with a build-time literal.
 * (Clerk/Supabase already use `process.env[name]` for the same reason.)
 */
function readRuntimeEnv(name: string): string | undefined {
  const env = process.env;
  return env[name];
}

/** Build env key names at runtime (defeats static env inlining of the name+value pair). */
function stripeSecretEnvName(): string {
  return ["STRIPE", "SECRET", "KEY"].join("_");
}

function stripePublishableEnvName(): string {
  return ["NEXT_PUBLIC", "STRIPE", "PUBLISHABLE", "KEY"].join("_");
}

function stripeWebhookEnvName(): string {
  return ["STRIPE", "WEBHOOK", "SECRET"].join("_");
}

/**
 * Normalize Stripe env values from Vercel/Dashboard paste artifacts.
 * Strips BOM, surrounding quotes, and whitespace — never logs the value.
 * Applies to secret/publishable/webhook keys and Price IDs (STRIPE_PRICE_*).
 * Never truncates a valid sk_/pk_/whsec_/price_ credential body.
 */
export function sanitizeStripeEnvValue(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  let value = raw.replace(/^\uFEFF/, "").trim();
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' || first === "'") && first === last) {
      const inner = value.slice(1, -1).trim();
      // Only strip matching edge quotes when the interior has no additional
      // matching quote (avoids destructive slice on malformed paste).
      if (!inner.includes(first)) {
        value = inner;
      }
    }
  }
  return value || null;
}

export function getStripeSecretKey(): string | null {
  return sanitizeStripeEnvValue(readRuntimeEnv(stripeSecretEnvName()));
}

export function getStripePublishableKey(): string | null {
  return sanitizeStripeEnvValue(readRuntimeEnv(stripePublishableEnvName()));
}

export function getStripeWebhookSecret(): string | null {
  return sanitizeStripeEnvValue(readRuntimeEnv(stripeWebhookEnvName()));
}

/** Safe diagnostics for billing summary — never includes the secret. */
export function getStripeSecretDiagnostics(): {
  secretConfigured: boolean;
  secretLength: number;
  secretPrefixValid: boolean;
} {
  const secret = getStripeSecretKey();
  return {
    secretConfigured: Boolean(secret),
    secretLength: secret?.length ?? 0,
    secretPrefixValid: secret?.startsWith("sk_live_") ?? false,
  };
}

export function getConfiguredAppUrl(): string | null {
  const value =
    readRuntimeEnv("NEXT_PUBLIC_APP_URL")?.trim() ||
    readRuntimeEnv("NEXT_PUBLIC_SITE_URL")?.trim() ||
    "";
  if (value) return value.replace(/\/$/, "");

  const vercel = readRuntimeEnv("VERCEL_URL")?.trim();
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

  // Same paste-artifact sanitization as secret keys (BOM / quotes / whitespace).
  return sanitizeStripeEnvValue(readRuntimeEnv(envKey));
}

/** Safe Price ID diagnostics — never includes the raw env value. */
export function getStripePriceIdDiagnostics(planId: PlanId): {
  configured: boolean;
  length: number;
  prefixValid: boolean;
} {
  const priceId = getStripePriceIdForPlan(planId);
  return {
    configured: Boolean(priceId),
    length: priceId?.length ?? 0,
    prefixValid: priceId?.startsWith("price_") ?? false,
  };
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
