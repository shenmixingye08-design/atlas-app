import "server-only";

import type Stripe from "stripe";

import { getStripeClient } from "./client";
import { getStripeWebhookSecret } from "./config";
import { handleStripeWebhookEvent } from "./webhook-handlers";
import {
  hasProcessedStripeEvent,
  markStripeEventProcessed,
} from "./webhook-idempotency";

export async function processStripeWebhookRequest(
  rawBody: string,
  signature: string | null,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const webhookSecret = getStripeWebhookSecret();
  const stripe = getStripeClient();

  let event: Stripe.Event;

  if (stripe && webhookSecret && signature) {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } else if (process.env.NODE_ENV === "production") {
    throw new Error("Stripe webhook signature verification is required");
  } else {
    event = JSON.parse(rawBody) as Stripe.Event;
  }

  if (hasProcessedStripeEvent(event.id)) {
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

  const result = await handleStripeWebhookEvent(event);

  if (result.success) {
    markStripeEventProcessed(event.id);
  }

  return {
    status: result.success || !result.handled ? 200 : 422,
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
