import type { PlanDefinition, PlanId } from "./plans/types";
import type { UserBillingSummary } from "./types";
import { isAssignableCheckoutUrl } from "./stripe/checkout-url";
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

export class CheckoutRequestError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(message: string, status: number, code: string | null) {
    super(message);
    this.name = "CheckoutRequestError";
    this.status = status;
    this.code = code;
  }
}

type CheckoutApiBody = {
  error?: string;
  code?: string;
  url?: unknown;
  sessionId?: unknown;
  mode?: unknown;
};

function readCheckoutApiBody(value: unknown): CheckoutApiBody {
  return value && typeof value === "object" ? (value as CheckoutApiBody) : {};
}

function assignableOrThrow(url: unknown, fallback: string): string {
  if (!isAssignableCheckoutUrl(url)) {
    throw new CheckoutRequestError(fallback, 500, "invalid_checkout_url");
  }
  return url;
}

export async function startCheckout(
  planId: PlanId,
): Promise<{ url: string; sessionId?: string; mode?: string }> {
  const response = await fetch("/api/billing/checkout", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ planId }),
  });

  const body = readCheckoutApiBody(await response.json().catch(() => null));

  if (!response.ok) {
    throw new CheckoutRequestError(
      body.error ?? ui.billing.checkoutFailed,
      response.status,
      typeof body.code === "string" ? body.code : null,
    );
  }

  return {
    url: assignableOrThrow(body.url, ui.billing.invalidCheckoutUrl),
    sessionId: typeof body.sessionId === "string" ? body.sessionId : undefined,
    mode: typeof body.mode === "string" ? body.mode : undefined,
  };
}

export async function openBillingPortal(
  targetPlanId?: PlanId,
): Promise<{ url: string }> {
  const changingPlan = Boolean(targetPlanId) && targetPlanId !== "free";
  const response = await fetch("/api/billing/portal", {
    method: "POST",
    credentials: "same-origin",
    ...(changingPlan
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetPlanId }),
        }
      : {}),
  });
  const body = readCheckoutApiBody(await response.json().catch(() => null));
  if (!response.ok) {
    throw new CheckoutRequestError(
      body.error ?? "Billing portal failed",
      response.status,
      typeof body.code === "string" ? body.code : null,
    );
  }
  return { url: assignableOrThrow(body.url, ui.billing.invalidCheckoutUrl) };
}

export function formatPlanPriceJpy(amount: number): string {
  if (amount === 0) return "無料";
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(amount);
}
