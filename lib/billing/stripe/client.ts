import "server-only";

import Stripe from "stripe";

import { getStripeSecretKey, isStripeConfigured } from "./config";

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe | null {
  if (!isStripeConfigured()) return null;

  if (!stripeClient) {
    stripeClient = new Stripe(getStripeSecretKey()!, {
      typescript: true,
    });
  }

  return stripeClient;
}
