import "server-only";

import type Stripe from "stripe";

import { getStripeClient } from "./client";
import { getStripeWebhookSecret } from "./config";
import { assertStripeWebhookSafeForProduction } from "./production-guard";
import { handleStripeWebhookEvent } from "./webhook-handlers";
import {
  claimStripeEventForProcessing,
  hasProcessedStripeEvent,
  markStripeEventProcessed,
  releaseStripeEventClaim,
} from "./webhook-idempotency";

/** Structured log without secrets, card data, or full event payloads. */
function logWebhookOutcome(input: {
  eventId: string;
  eventType: string;
  status: number;
  duplicate?: boolean;
  success?: boolean;
  handled?: boolean;
}): void {
  console.info(
    `[billing:webhook] eventId=${input.eventId} type=${input.eventType} status=${input.status}` +
      (input.duplicate ? " duplicate=true" : "") +
      (input.success === false ? " success=false" : "") +
      (input.handled === false ? " handled=false" : ""),
  );
}

export async function processStripeWebhookRequest(
  rawBody: string,
  signature: string | null,
): Promise<{ status: number; body: Record<string, unknown> }> {
  try {
    assertStripeWebhookSafeForProduction();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Stripe webhook not safe for production";
    console.error("[billing:webhook] production guard:", message);
    return {
      status: 503,
      body: { error: "Stripe webhook is not configured for production" },
    };
  }

  const webhookSecret = getStripeWebhookSecret();
  const stripe = getStripeClient();

  if (!stripe || !webhookSecret) {
    return {
      status: 503,
      body: { error: "Stripe webhook is not configured" },
    };
  }

  if (!signature) {
    return {
      status: 400,
      body: { error: "Missing Stripe signature" },
    };
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    return {
      status: 400,
      body: { error: "Invalid Stripe signature" },
    };
  }

  // Fast-path duplicate check (optional); claim is the real mutex.
  if (await hasProcessedStripeEvent(event.id)) {
    logWebhookOutcome({
      eventId: event.id,
      eventType: event.type,
      status: 200,
      duplicate: true,
    });
    return {
      status: 200,
      body: {
        received: true,
        duplicate: true,
        eventId: event.id,
        eventType: event.type,
      },
    };
  }

  // P0 FINAL GATE: claim-before-process with lease — only winner runs side effects.
  const claim = await claimStripeEventForProcessing(event.id, event.type);
  if (!claim.ok) {
    logWebhookOutcome({
      eventId: event.id,
      eventType: event.type,
      status: 503,
      success: false,
    });
    return {
      status: 503,
      body: { error: "Webhook idempotency store unavailable" },
    };
  }
  if (!claim.claimed) {
    // in_progress: another worker holds a valid lease → 503 so Stripe retries.
    // duplicate: already processed → 200 ack (no side effects).
    if (claim.reason === "in_progress") {
      logWebhookOutcome({
        eventId: event.id,
        eventType: event.type,
        status: 503,
        success: false,
      });
      return {
        status: 503,
        body: {
          received: true,
          inProgress: true,
          eventId: event.id,
          eventType: event.type,
        },
      };
    }
    logWebhookOutcome({
      eventId: event.id,
      eventType: event.type,
      status: 200,
      duplicate: true,
    });
    return {
      status: 200,
      body: {
        received: true,
        duplicate: true,
        eventId: event.id,
        eventType: event.type,
      },
    };
  }

  let result: Awaited<ReturnType<typeof handleStripeWebhookEvent>>;
  try {
    result = await handleStripeWebhookEvent(event);
  } catch (error) {
    // Transient / unexpected — release claim so Stripe retries.
    const message =
      error instanceof Error ? error.message : "Webhook handler threw";
    console.error(
      `[billing:webhook] handler exception eventId=${event.id} type=${event.type}:`,
      message,
    );
    await releaseStripeEventClaim(event.id);
    return {
      status: 500,
      body: {
        received: true,
        handled: true,
        success: false,
        eventType: event.type,
        message: "Webhook handler failed",
      },
    };
  }

  if (result.success) {
    await markStripeEventProcessed(event.id, event.type);
  } else if (result.handled) {
    if (result.retryable === false) {
      // Permanent fail-closed (e.g. cross-user customer ownership) — ack, no retry storm.
      await markStripeEventProcessed(event.id, event.type);
    } else {
      // Transient handled failure — release so Stripe can retry safely.
      await releaseStripeEventClaim(event.id);
    }
  } else {
    // Unhandled/skipped: keep claim to avoid replaying unknown noise forever.
    await markStripeEventProcessed(event.id, event.type);
  }

  // Failures that were handled but unsuccessful: 500 so Stripe retries.
  // Permanent rejections (retryable=false) and unhandled/skipped: 200 ack.
  const status =
    result.success || !result.handled || result.retryable === false
      ? 200
      : 500;

  logWebhookOutcome({
    eventId: event.id,
    eventType: event.type,
    status,
    success: result.success,
    handled: result.handled,
  });

  return {
    status,
    body: {
      received: true,
      handled: result.handled,
      success: result.success,
      eventType: result.eventType,
      message: result.message,
      userId: result.userId,
      planId: result.planId,
    },
  };
}
