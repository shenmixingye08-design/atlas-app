import type { PlanDefinition, PlanId } from "./plans/types";
import type { UserBillingSummary } from "./types";
import { ui } from "@/lib/i18n";

export type {
  BillingFeatureId,
  PlanCheckResult,
  PlanDefinition,
  PlanId,
} from "./plans";

export type {
  SubscriptionStatus,
  UserSubscriptionRecord,
  UserSubscriptionView,
} from "./subscriptions";

export type { UsageLimitSummary, UsageSnapshot } from "./usage";
export type { UserBillingSummary, OwnerBillingMetrics, OwnerPlanBreakdown } from "./types";

export {
  getPaidPlans,
  getPlanDefinition,
  isPlanId,
  listPlanDefinitions,
} from "./plans";

export async function fetchBillingSummary(): Promise<UserBillingSummary> {
  const response = await fetch("/api/billing/summary", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load billing summary");
  }
  return response.json() as Promise<UserBillingSummary>;
}

export async function fetchPlanCatalog(): Promise<{
  plans: readonly PlanDefinition[];
}> {
  const response = await fetch("/api/billing/plans", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load plans");
  }
  return response.json() as Promise<{ plans: readonly PlanDefinition[] }>;
}

export async function startCheckout(planId: PlanId): Promise<{ url: string }> {
  const response = await fetch("/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ planId }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? ui.billing.checkoutFailed);
  }

  return response.json() as Promise<{ url: string }>;
}

export async function openBillingPortal(): Promise<{ url: string }> {
  const response = await fetch("/api/billing/portal", { method: "POST" });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? "Billing portal failed");
  }
  return response.json() as Promise<{ url: string }>;
}

export function formatPlanPriceJpy(amount: number): string {
  if (amount === 0) return "無料";
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(amount);
}
