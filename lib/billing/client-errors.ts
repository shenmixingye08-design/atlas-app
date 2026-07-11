/** Client helper for billing plan denial payloads from APIs. */

export type PlanAccessErrorPayload = {
  error?: string;
  message?: string;
  reason?: string;
  currentPlan?: string;
  currentPlanName?: string;
  requiredPlan?: string | null;
  requiredPlanName?: string | null;
  upgradePath?: string;
};

export function isPlanAccessErrorPayload(
  value: unknown,
): value is PlanAccessErrorPayload {
  if (!value || typeof value !== "object") return false;
  const row = value as PlanAccessErrorPayload;
  return row.error === "plan_required" || typeof row.requiredPlanName === "string";
}

export function formatPlanAccessErrorMessage(
  payload: PlanAccessErrorPayload,
): string {
  if (payload.requiredPlanName) {
    return (
      payload.message ??
      payload.reason ??
      `この機能は${payload.requiredPlanName}プラン以上でご利用いただけます`
    );
  }
  return (
    payload.message ??
    payload.reason ??
    payload.error ??
    "現在のプランではこの機能をご利用いただけません"
  );
}
