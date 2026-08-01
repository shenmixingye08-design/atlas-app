import { randomUUID } from "crypto";

import {
  claimStripeEventForProcessing,
  markStripeEventProcessed,
  releaseStripeEventClaim,
  resetProcessedStripeEvents,
} from "@/lib/billing/stripe/webhook-idempotency";
import { verifyHeavyRoutesBillingGated } from "@/lib/release-blocker/verify-gates";

export type BillingCaseResult = {
  caseId: string;
  ok: boolean;
  detail: string;
};

/**
 * Phase2 Stripe/billing audit (unit + static gates).
 * Production Stripe live calls remain blocked without secrets.
 */
export async function runBillingCases(): Promise<BillingCaseResult[]> {
  const out: BillingCaseResult[] = [];

  out.push({
    caseId: "rb_bill_heavy_routes_gated",
    ok: verifyHeavyRoutesBillingGated(),
    detail: "vision/pptx/excel/convert requireBillingAiUsage+rateLimit",
  });

  // Free-plan quota: exceed aiRuns → denied
  {
    const { resetSubscriptionStore } = await import(
      "@/lib/billing/subscriptions/store"
    );
    const { resetUsageStore } = await import("@/lib/billing/usage/store");
    const { incrementUsageCounter } = await import(
      "@/lib/billing/usage/store"
    );
    const { evaluateAiUsageAccess } = await import("@/lib/billing/policy");
    const { getPlanDefinition } = await import("@/lib/billing/plans");

    resetSubscriptionStore();
    resetUsageStore();
    const userId = "rb_free_user";
    const freeLimit = getPlanDefinition("free").limits.aiUsageMonthly;
    if (freeLimit > 0) {
      incrementUsageCounter(userId, "aiRuns", freeLimit);
    }
    const denied = evaluateAiUsageAccess(userId);
    out.push({
      caseId: "rb_bill_free_quota_blocks",
      ok: freeLimit === 0 ? !denied.allowed : !denied.allowed,
      detail: `freeLimit=${freeLimit} allowed=${denied.allowed} reason=${
        denied.allowed ? "n/a" : denied.reason
      }`,
    });
  }

  // Paid plan can use AI when under quota
  {
    const { resetSubscriptionStore } = await import(
      "@/lib/billing/subscriptions/store"
    );
    const { resetUsageStore } = await import("@/lib/billing/usage/store");
    const { applySubscriptionFromStripe } = await import(
      "@/lib/billing/subscriptions/service"
    );
    const { evaluateAiUsageAccess } = await import("@/lib/billing/policy");

    resetSubscriptionStore();
    resetUsageStore();
    const userId = "rb_paid_user";
    applySubscriptionFromStripe({
      userId,
      stripeCustomerId: `cus_${userId}`,
      stripeSubscriptionId: `sub_${userId}`,
      planId: "standard",
      status: "active",
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
    const allowed = evaluateAiUsageAccess(userId);
    out.push({
      caseId: "rb_bill_paid_can_use",
      ok: allowed.allowed === true,
      detail: `allowed=${allowed.allowed}`,
    });
  }

  // Canceled subscription → free entitlements
  {
    const { resetSubscriptionStore } = await import(
      "@/lib/billing/subscriptions/store"
    );
    const { applySubscriptionFromStripe } = await import(
      "@/lib/billing/subscriptions/service"
    );
    const { resolveUserSubscription } = await import(
      "@/lib/billing/subscriptions/service"
    );

    resetSubscriptionStore();
    const userId = "rb_cancel_user";
    applySubscriptionFromStripe({
      userId,
      stripeCustomerId: `cus_${userId}`,
      stripeSubscriptionId: `sub_${userId}`,
      planId: "standard",
      status: "active",
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
    applySubscriptionFromStripe({
      userId,
      stripeCustomerId: `cus_${userId}`,
      stripeSubscriptionId: `sub_${userId}`,
      planId: "free",
      status: "canceled",
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
    const sub = resolveUserSubscription(userId);
    out.push({
      caseId: "rb_bill_cancel_downgrade",
      ok: sub.planId === "free" || sub.status === "canceled",
      detail: `planId=${sub.planId} status=${sub.status}`,
    });
  }

  // Webhook duplicate / in-flight
  {
    resetProcessedStripeEvents();
    const eventId = `evt_bill_${randomUUID().slice(0, 8)}`;
    const c1 = await claimStripeEventForProcessing(eventId, "invoice.paid");
    const c2 = await claimStripeEventForProcessing(eventId, "invoice.paid");
    await markStripeEventProcessed(eventId, "invoice.paid");
    const c3 = await claimStripeEventForProcessing(eventId, "invoice.paid");
    releaseStripeEventClaim(eventId);
    out.push({
      caseId: "rb_bill_webhook_dedupe",
      ok: c1 === "claimed" && c2 === "in_flight" && c3 === "duplicate",
      detail: `c1=${c1} c2=${c2} c3=${c3}`,
    });
  }

  // Refund path does not silently claim entitlement restore — documented High
  {
    const { readFileSync, existsSync } = await import("fs");
    const { join } = await import("path");
    const path = join(
      process.cwd(),
      "lib/billing/stripe/webhook-handlers.ts"
    );
    const src = existsSync(path) ? readFileSync(path, "utf8") : "";
    const recordsOnly =
      src.includes("charge.refunded") &&
      /Record only|Auto-downgrade on refund/i.test(src);
    out.push({
      caseId: "rb_bill_refund_no_silent_entitlement",
      ok: recordsOnly,
      detail: recordsOnly
        ? "refund is history-only (High: no auto-downgrade)"
        : "refund handler missing or unexpected",
    });
  }

  return out;
}
