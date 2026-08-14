import type { PlanId } from "@/lib/billing/plans/types";

/**
 * Paid → paid must use Billing Portal (no second Checkout / subscription).
 * Free → paid uses Checkout.
 */
export function shouldOpenPortalForPlanChange(input: {
  currentPlanId: PlanId;
  targetPlanId: PlanId;
  isPaid: boolean;
}): boolean {
  if (input.targetPlanId === "free") return false;
  if (input.targetPlanId === input.currentPlanId) return false;
  return input.isPaid && input.currentPlanId !== "free";
}
