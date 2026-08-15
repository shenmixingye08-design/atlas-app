import { isPlanId } from "../plans/registry";
import type { PlanId } from "../plans/types";

export type PaidPlanId = Exclude<PlanId, "free">;

/**
 * Read optional targetPlanId from a portal POST body.
 * Ignores customer / price IDs — those are never taken from the client.
 */
export function parsePortalTargetPlanId(
  body: unknown,
): { ok: true; targetPlanId: PaidPlanId | undefined } | { ok: false } {
  if (body == null) {
    return { ok: true, targetPlanId: undefined };
  }
  if (typeof body !== "object") {
    return { ok: false };
  }

  const value = (body as { targetPlanId?: unknown }).targetPlanId;
  if (value === undefined || value === null || value === "") {
    return { ok: true, targetPlanId: undefined };
  }
  if (typeof value !== "string" || !isPlanId(value) || value === "free") {
    return { ok: false };
  }
  return { ok: true, targetPlanId: value };
}

export function isPaidPlanId(value: PlanId): value is PaidPlanId {
  return value !== "free";
}
