import { isAtlasProduction } from "@/lib/runtime/is-production";

import type { PlanId } from "../plans/types";

export const STRIPE_CHECKOUT_SUCCESS_PATH = "/billing/success";
export const STRIPE_CHECKOUT_CANCEL_PATH = "/billing/cancel";

/**
 * Canonical production host. Post-checkout redirects MUST land here so Clerk
 * session cookies (scoped to atlasapp.jp) are present — a *.vercel.app redirect
 * has no cookie and bounces the user to /sign-in. Never emit *.vercel.app in
 * success_url / cancel_url / portal return_url for production.
 */
export const ATLAS_CANONICAL_ORIGIN = "https://atlasapp.jp";

/** Settings page users are returned to after a completed/cancelled checkout. */
export const BILLING_SETTINGS_PATH = "/settings/billing";

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

function isVercelAppHost(urlOrHost: string): boolean {
  try {
    const host = urlOrHost.includes("://")
      ? new URL(urlOrHost).hostname
      : urlOrHost.replace(/^https?:\/\//, "").split("/")[0] ?? "";
    return host === "vercel.app" || host.endsWith(".vercel.app");
  } catch {
    return urlOrHost.includes(".vercel.app");
  }
}

/**
 * Public origin for redirects. Production ALWAYS prefers atlasapp.jp and never
 * returns *.vercel.app (Clerk cookies are scoped to the custom domain).
 */
export function getConfiguredAppUrl(): string | null {
  if (isAtlasProduction()) {
    const preferred =
      readRuntimeEnv("NEXT_PUBLIC_APP_URL")?.trim() ||
      readRuntimeEnv("NEXT_PUBLIC_SITE_URL")?.trim() ||
      "";
    const normalized = preferred.replace(/\/$/, "");
    if (normalized && !isVercelAppHost(normalized)) {
      return normalized;
    }
    return ATLAS_CANONICAL_ORIGIN;
  }

  const value =
    readRuntimeEnv("NEXT_PUBLIC_APP_URL")?.trim() ||
    readRuntimeEnv("NEXT_PUBLIC_SITE_URL")?.trim() ||
    "";
  if (value) return value.replace(/\/$/, "");

  return null;
}

/** Prefer configured public URL; never fall back to *.vercel.app in production. */
export function resolveAppOrigin(fallbackOrigin: string): string {
  if (isAtlasProduction()) {
    return getConfiguredAppUrl() ?? ATLAS_CANONICAL_ORIGIN;
  }

  const configured = getConfiguredAppUrl();
  if (configured) return configured;

  const fallback = fallbackOrigin.replace(/\/$/, "");
  if (isVercelAppHost(fallback)) {
    return ATLAS_CANONICAL_ORIGIN;
  }
  return fallback;
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

/**
 * Checkout return URLs. Production is hard-pinned to atlasapp.jp so Stripe never
 * sends users to a *.vercel.app host (no Clerk session cookie → /sign-in bounce).
 */
export function resolveCheckoutUrls(fallbackOrigin?: string): {
  successUrl: string;
  cancelUrl: string;
} {
  const origin = isAtlasProduction()
    ? ATLAS_CANONICAL_ORIGIN
    : resolveAppOrigin(fallbackOrigin ?? "http://localhost:3000");

  return {
    successUrl: `${origin}${STRIPE_CHECKOUT_SUCCESS_PATH}?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${origin}${BILLING_SETTINGS_PATH}?checkout=cancelled`,
  };
}
