import "server-only";

import { warnIfProductionSupabaseServiceRoleMissing } from "@/lib/persistence/production-guard";
import { isAtlasProduction } from "@/lib/runtime/is-production";

import {
  claimWebhookEventInSupabase,
  hasProcessedWebhookEventInSupabase,
  isBillingSupabaseConfigured,
  markWebhookEventProcessedInSupabase,
  releaseWebhookEventClaimInSupabase,
  type WebhookClaimResult,
} from "../subscriptions/persistence";
import {
  claimWebhookEventInMemory,
  hasProcessedWebhookEventInMemory,
  markWebhookEventProcessedInMemory,
  releaseWebhookEventClaimInMemory,
  resetWebhookClaimLeaseStoreForTests,
} from "./webhook-claim-lease";

export type { WebhookClaimResult };

/**
 * Durable-first processed check.
 * Claimed/processing must NOT count as processed.
 */
export async function hasProcessedStripeEvent(eventId: string): Promise<boolean> {
  if (hasProcessedWebhookEventInMemory(eventId)) return true;

  if (!isBillingSupabaseConfigured()) {
    if (isAtlasProduction()) {
      warnIfProductionSupabaseServiceRoleMissing("atlas_stripe_webhook_events");
    }
    return false;
  }

  return hasProcessedWebhookEventInSupabase(eventId);
}

/**
 * Claim-before-process with lease.
 * Only `{ claimed: true }` may run billing side effects.
 */
export async function claimStripeEventForProcessing(
  eventId: string,
  eventType?: string | null,
): Promise<WebhookClaimResult> {
  if (!isBillingSupabaseConfigured()) {
    if (isAtlasProduction()) {
      warnIfProductionSupabaseServiceRoleMissing("atlas_stripe_webhook_events");
      return { ok: false, reason: "unavailable" };
    }
    return claimWebhookEventInMemory(eventId, eventType);
  }

  return claimWebhookEventInSupabase(eventId, eventType);
}

/** Release claim after handler failure so Stripe can retry safely. */
export async function releaseStripeEventClaim(eventId: string): Promise<void> {
  releaseWebhookEventClaimInMemory(eventId);
  if (!isBillingSupabaseConfigured()) {
    if (isAtlasProduction()) {
      warnIfProductionSupabaseServiceRoleMissing("atlas_stripe_webhook_events");
    }
    return;
  }
  await releaseWebhookEventClaimInSupabase(eventId);
}

/**
 * Mark after successful handler only.
 */
export async function markStripeEventProcessed(
  eventId: string,
  eventType?: string | null,
): Promise<void> {
  markWebhookEventProcessedInMemory(eventId, eventType);

  if (!isBillingSupabaseConfigured()) {
    if (isAtlasProduction()) {
      warnIfProductionSupabaseServiceRoleMissing("atlas_stripe_webhook_events");
    }
    return;
  }

  const ok = await markWebhookEventProcessedInSupabase(eventId, eventType);
  if (!ok && isAtlasProduction()) {
    console.error(
      `[billing:webhook] failed to durably mark processed eventId=${eventId}`,
    );
  }
}

export function resetProcessedStripeEvents(): void {
  resetWebhookClaimLeaseStoreForTests();
}
