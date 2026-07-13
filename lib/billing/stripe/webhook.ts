import "server-only";

import type Stripe from "stripe";

import { getStripeClient } from "./client";
import { getStripeWebhookSecret } from "./config";
import { assertStripeWebhookSafeForProduction } from "./production-guard";
import { handleStripeWebhookEvent } from "./webhook-handlers";
import {
  hasProcessedStripeEvent,
  markStripeEventProcessed,
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

  let result: Awaited<ReturnType<typeof handleStripeWebhookEvent>>;
  try {
    result = await handleStripeWebhookEvent(event);
  } catch (error) {
    // Transient / unexpected — return 5xx so Stripe retries.
    const message =
      error instanceof Error ? error.message : "Webhook handler threw";
    console.error(
      `[billing:webhook] handler exception eventId=${event.id} type=${event.type}:`,
      message,
    );
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
  }

  // Failures that were handled but unsuccessful: 500 so Stripe retries.
  // Unhandled/skipped events: 200 (ack; no retry needed).
  const status =
    result.success || !result.handled
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
