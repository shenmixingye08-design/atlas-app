import { isAtlasProduction } from "@/lib/runtime/is-production";

import {
  getStripePublishableKey,
  getStripeSecretKey,
  getStripeWebhookSecret,
  isStripeConfigured,
} from "./config";

/** True when secret key is a live (sk_live_) key. */
export function usesStripeLiveSecretKey(): boolean {
  return getStripeSecretKey()?.startsWith("sk_live_") ?? false;
}

/** True when publishable key is a live (pk_live_) key. */
export function usesStripeLivePublishableKey(): boolean {
  return getStripePublishableKey()?.startsWith("pk_live_") ?? false;
}

/**
 * Detect Stripe test-mode keys.
 * Production must use sk_live_ / pk_live_.
 */
export function usesStripeTestKeys(): boolean {
  const secret = getStripeSecretKey() ?? "";
  const publishable = getStripePublishableKey() ?? "";
  return (
    secret.startsWith("sk_test_") || publishable.startsWith("pk_test_")
  );
}

/** True when secret and publishable keys disagree on live vs test mode. */
export function hasStripeKeyModeMismatch(): boolean {
  const secret = getStripeSecretKey();
  const publishable = getStripePublishableKey();
  if (!secret || !publishable) return false;

  const secretLive = secret.startsWith("sk_live_");
  const secretTest = secret.startsWith("sk_test_");
  const pubLive = publishable.startsWith("pk_live_");
  const pubTest = publishable.startsWith("pk_test_");

  if ((secretLive || secretTest) && (pubLive || pubTest)) {
    return secretLive !== pubLive;
  }
  return false;
}

export function isStripeWebhookConfigured(): boolean {
  return Boolean(getStripeWebhookSecret());
}

/**
 * Production must not run Checkout/Portal with missing or test Stripe keys.
 * Throws so billing routes can fail closed.
 */
export function assertStripeSafeForProduction(): void {
  if (!isAtlasProduction()) return;

  if (!isStripeConfigured()) {
    throw new Error(
      "STRIPE_SECRET_KEY and NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY must be set in production",
    );
  }

  if (usesStripeTestKeys()) {
    throw new Error(
      "Stripe test keys (sk_test_ / pk_test_) must not be used in production",
    );
  }

  if (hasStripeKeyModeMismatch()) {
    throw new Error(
      "Stripe secret and publishable keys must both be live or both be test mode",
    );
  }

  const secret = getStripeSecretKey() ?? "";
  const publishable = getStripePublishableKey() ?? "";
  if (
    (secret.startsWith("sk_") && !secret.startsWith("sk_live_")) ||
    (publishable.startsWith("pk_") && !publishable.startsWith("pk_live_"))
  ) {
    throw new Error(
      "Production Stripe keys must be live mode (sk_live_ / pk_live_)",
    );
  }
}

/**
 * Webhook path additionally requires a signing secret in production.
 */
export function assertStripeWebhookSafeForProduction(): void {
  assertStripeSafeForProduction();
  if (!isAtlasProduction()) return;

  if (!isStripeWebhookConfigured()) {
    throw new Error(
      "STRIPE_WEBHOOK_SECRET must be set for Stripe webhooks in production",
    );
  }
}
