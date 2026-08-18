import { isPlanId } from "../plans/registry";
import type { PlanId } from "../plans/types";

import { resolvePlanIdFromStripePrice } from "./config";

export type PaidPlanResolveSource = "price" | "metadata" | "none";

export type PaidPlanResolveResult = {
  planId: PlanId | null;
  source: PaidPlanResolveSource;
  /** Both refs exist and disagree. Price wins when it maps. */
  conflict: boolean;
  /** A Price ID was present but is not in the server allowlist. */
  unknownPrice: boolean;
};

function mapPaidPlanId(value: string | null | undefined): PlanId | null {
  if (!value || !isPlanId(value) || value === "free") return null;
  return value;
}

/**
 * Source of Truth for "what the customer paid".
 *
 * 1. Allowlisted Stripe Price ID wins — even if metadata.planId conflicts.
 * 2. Unknown Price ID is fail-closed (do not trust metadata to grant a plan).
 * 3. Metadata is used only when Stripe did not attach a Price ID.
 */
export function resolvePaidPlanFromStripeRefs(input: {
  priceId?: string | null;
  metadataPlanId?: string | null;
}): PaidPlanResolveResult {
  const priceId = input.priceId?.trim() || null;
  const fromPrice = resolvePlanIdFromStripePrice(priceId);
  const fromMeta = mapPaidPlanId(input.metadataPlanId);

  if (priceId) {
    if (fromPrice) {
      return {
        planId: fromPrice,
        source: "price",
        conflict: Boolean(fromMeta && fromMeta !== fromPrice),
        unknownPrice: false,
      };
    }

    return {
      planId: null,
      source: "none",
      conflict: Boolean(fromMeta),
      unknownPrice: true,
    };
  }

  if (fromMeta) {
    return {
      planId: fromMeta,
      source: "metadata",
      conflict: false,
      unknownPrice: false,
    };
  }

  return {
    planId: null,
    source: "none",
    conflict: false,
    unknownPrice: false,
  };
}

export function resolvePaidPlanFromStripeSubscription(input: {
  metadata?: { planId?: string } | null;
  items?: { data?: Array<{ price?: { id?: string } | null }> };
}): PaidPlanResolveResult {
  return resolvePaidPlanFromStripeRefs({
    priceId: input.items?.data?.[0]?.price?.id ?? null,
    metadataPlanId: input.metadata?.planId ?? null,
  });
}
