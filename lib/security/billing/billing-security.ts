import "server-only";

import { createHash } from "crypto";

import type { PlanId } from "@/lib/billing/plans/types";
import { isPlanId } from "@/lib/billing/plans/registry";
import {
  createSecurityRequestId,
  recordSecurityAudit,
} from "@/lib/security/audit/security-audit";
import {
  assertNotReplay,
  buildReplayKey,
  markReplaySeen,
} from "@/lib/security/api/replay";

export type BillingOperation =
  | "checkout"
  | "subscription"
  | "upgrade"
  | "downgrade"
  | "cancel"
  | "resume"
  | "refund"
  | "webhook"
  | "plan_change"
  | "quota"
  | "usage";

/**
 * Validate checkout payload — reject free plan checkout and unknown plans.
 */
export function validateCheckoutPayload(input: {
  planId: unknown;
  priceId?: unknown;
}): { ok: true; planId: PlanId } | { ok: false; reason: string } {
  if (typeof input.planId !== "string" || !isPlanId(input.planId)) {
    return { ok: false, reason: "無効なプランです" };
  }
  if (input.planId === "free") {
    return { ok: false, reason: "FreeプランへのCheckoutは不要です" };
  }
  if (
    input.priceId !== undefined &&
    input.priceId !== null &&
    typeof input.priceId !== "string"
  ) {
    return { ok: false, reason: "無効な priceId です" };
  }
  return { ok: true, planId: input.planId };
}

/**
 * Prevent double-checkout races for the same user+plan within a short window.
 */
export function assertCheckoutNotDuplicate(input: {
  userId: string;
  planId: PlanId;
}): { ok: true; request_id: string } | { ok: false; reason: string; request_id: string } {
  const request_id = createSecurityRequestId();
  const key = buildReplayKey({
    userId: input.userId,
    method: "POST",
    path: "/api/billing/checkout",
    idempotencyKey: `checkout:${input.planId}`,
    bodyFingerprint: createHash("sha256")
      .update(`${input.userId}:${input.planId}`)
      .digest("hex"),
  });
  const replay = assertNotReplay({ key, ttlMs: 30_000 });
  if (!replay.ok) {
    recordSecurityAudit({
      request_id,
      who: input.userId,
      what: "billing.checkout.duplicate",
      whereFrom: null,
      resource: "billing",
      action: "checkout",
      success: false,
      reason: replay.reason,
      decision: "deny_replay",
      durationMs: 0,
    });
    return { ok: false, reason: "Checkoutが重複しています", request_id };
  }
  markReplaySeen(key);
  return { ok: true, request_id };
}

export function auditBillingOperation(input: {
  userId: string | null;
  operation: BillingOperation;
  success: boolean;
  reason: string;
  requestId?: string;
  ip?: string | null;
  targetId?: string | null;
}): string {
  const request_id = input.requestId ?? createSecurityRequestId();
  recordSecurityAudit({
    request_id,
    who: input.userId,
    what: `billing.${input.operation}`,
    whereFrom: input.ip ?? null,
    resource: "billing",
    action: input.operation === "checkout" ? "checkout" : "manage",
    success: input.success,
    reason: input.reason,
    decision: input.success ? "allow" : "deny_billing",
    durationMs: 0,
  });
  return request_id;
}

/** Map Stripe webhook types to billing operations for audit clarity. */
export function billingOperationFromWebhookType(
  eventType: string,
): BillingOperation {
  if (eventType.includes("checkout")) return "checkout";
  if (eventType.includes("refund")) return "refund";
  if (eventType.includes("updated")) return "plan_change";
  if (eventType.includes("deleted")) return "cancel";
  if (eventType.includes("subscription")) return "subscription";
  return "webhook";
}
