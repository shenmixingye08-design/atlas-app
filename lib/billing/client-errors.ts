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
  used?: number;
  limit?: number;
  remaining?: number;
  resetLabel?: string;
  recommendedPlan?: string | null;
  recommendedPlanName?: string | null;
  recommendedLimit?: number | null;
  otherFeaturesRemain?: string | null;
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
  const base =
    payload.message ??
    payload.reason ??
    (payload.requiredPlanName
      ? `この機能は${payload.requiredPlanName}プラン以上でご利用いただけます`
      : (payload.error ?? "現在のプランではこの機能をご利用いただけません"));

  const extras: string[] = [base];
  if (typeof payload.used === "number" && typeof payload.limit === "number") {
    extras.push(`現在：${payload.used} / ${payload.limit}`);
  }
  if (payload.resetLabel) extras.push(payload.resetLabel);
  if (
    payload.recommendedPlanName &&
    typeof payload.recommendedLimit === "number"
  ) {
    extras.push(
      `${payload.recommendedPlanName}なら月${payload.recommendedLimit}まで利用できます`,
    );
  }
  if (payload.otherFeaturesRemain) extras.push(payload.otherFeaturesRemain);
  return extras.join("\n");
}
