import { auth } from "@clerk/nextjs/server";

import { resolveUserSubscriptionDurable } from "@/lib/billing/subscriptions/store";
import { createBillingPortalSession } from "@/lib/billing/stripe/checkout";
import {
  CHECKOUT_ALREADY_SAME_PLAN_MESSAGE,
  CHECKOUT_CONFIG_USER_ERROR_MESSAGE,
  CheckoutBlockedError,
  PORTAL_INVALID_TARGET_PLAN_MESSAGE,
  PORTAL_NO_SUBSCRIPTION_MESSAGE,
  PORTAL_PLAN_CHANGE_FAILED_MESSAGE,
} from "@/lib/billing/stripe/errors";
import { parsePortalTargetPlanId } from "@/lib/billing/stripe/portal-target";
import { assertStripeSafeForProduction } from "@/lib/billing/stripe/production-guard";
import { clientSafeMessage } from "@/lib/security/client-safe-message";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_CUSTOMER_MESSAGE =
  "お支払い情報が見つかりません。先にプランを選択して決済を完了してください。";
const PORTAL_USER_ERROR_MESSAGE =
  "請求ポータルを開けませんでした。しばらくしてから再度お試しください。";

function resolveOrigin(request: Request): string {
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ?? "http";

  if (host) {
    return `${protocol}://${host}`;
  }

  return new URL(request.url).origin;
}

async function readPortalBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return null;
  }
  return request.json().catch(() => null);
}

function classifyPortalFailure(
  error: unknown,
  hasTargetPlan: boolean,
): { status: number; code: string; userMessage: string } {
  if (error instanceof CheckoutBlockedError && error.code === "already_same_plan") {
    return {
      status: 409,
      code: "already_same_plan",
      userMessage: error.userMessage,
    };
  }

  const message = error instanceof Error ? error.message : "";
  if (/No active Stripe subscription to update/i.test(message)) {
    return {
      status: 400,
      code: "no_subscription",
      userMessage: PORTAL_NO_SUBSCRIPTION_MESSAGE,
    };
  }
  if (
    /Stripe price is not configured for plan/i.test(message) ||
    /Stripe price is not allowed for plan/i.test(message) ||
    /Stripe price is not in the allowlist/i.test(message)
  ) {
    return {
      status: 503,
      code: "stripe_price_missing",
      userMessage: CHECKOUT_CONFIG_USER_ERROR_MESSAGE,
    };
  }
  if (
    /Stripe is not configured/i.test(message) ||
    /STRIPE_SECRET_KEY/i.test(message)
  ) {
    return {
      status: 503,
      code: "stripe_not_configured",
      userMessage: hasTargetPlan
        ? PORTAL_PLAN_CHANGE_FAILED_MESSAGE
        : PORTAL_USER_ERROR_MESSAGE,
    };
  }

  return {
    status: 500,
    code: "portal_failed",
    userMessage: hasTargetPlan
      ? PORTAL_PLAN_CHANGE_FAILED_MESSAGE
      : PORTAL_USER_ERROR_MESSAGE,
  };
}

async function safeRecordStripeFailure(
  message: string,
  source: string,
): Promise<void> {
  try {
    const { recordStripeFailure } = await import(
      "@/lib/owner/error-monitoring/telemetry"
    );
    recordStripeFailure(message, source);
  } catch (telemetryError) {
    console.error("[billing/portal] recordStripeFailure failed", {
      source,
      message:
        telemetryError instanceof Error
          ? telemetryError.message
          : "unknown telemetry error",
    });
  }
}

/**
 * Opens Stripe Customer Portal for the signed-in user only.
 * Never accepts a client-supplied customer ID or Price ID.
 *
 * 「お支払い管理」: no targetPlanId → portal home.
 * 「このプランに変更」: targetPlanId → subscription_update_confirm.
 * return_url is always /settings/billing.
 */
export async function POST(request: Request): Promise<Response> {
  console.info("[billing/portal] POST start");
  let hasTargetPlan = false;

  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json(
        { error: "Unauthorized", code: "unauthorized" },
        { status: 401 },
      );
    }

    try {
      assertStripeSafeForProduction();
    } catch (error) {
      const message =
        clientSafeMessage(error, "Stripe is not configured");
      console.error("[billing/portal] production guard failed", { message });
      await safeRecordStripeFailure(message, "billing_portal");
      return Response.json(
        { error: PORTAL_USER_ERROR_MESSAGE, code: "stripe_not_configured" },
        { status: 503 },
      );
    }

    const parsed = parsePortalTargetPlanId(await readPortalBody(request));
    if (!parsed.ok) {
      return Response.json(
        {
          error: PORTAL_INVALID_TARGET_PLAN_MESSAGE,
          code: "invalid_target_plan",
        },
        { status: 400 },
      );
    }
    const targetPlanId = parsed.targetPlanId;
    hasTargetPlan = Boolean(targetPlanId);

    const subscription = await resolveUserSubscriptionDurable(userId);
    if (!subscription.stripeCustomerId) {
      return Response.json(
        { error: NO_CUSTOMER_MESSAGE, code: "no_customer" },
        { status: 400 },
      );
    }

    if (targetPlanId && subscription.planId === targetPlanId) {
      return Response.json(
        {
          error: CHECKOUT_ALREADY_SAME_PLAN_MESSAGE,
          code: "already_same_plan",
        },
        { status: 409 },
      );
    }

    const portal = await createBillingPortalSession({
      stripeCustomerId: subscription.stripeCustomerId,
      origin: resolveOrigin(request),
      targetPlanId,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      currentPlanId: subscription.planId,
    });

    console.info("[billing/portal] session created", {
      mode: portal.mode,
      flow: portal.flow,
      targetPlanId: targetPlanId ?? null,
    });
    return Response.json(portal);
  } catch (error) {
    const classified = classifyPortalFailure(error, hasTargetPlan);
    const message = clientSafeMessage(error, classified.userMessage);
    console.error("[billing/portal] failed", {
      message,
      code: classified.code,
    });
    await safeRecordStripeFailure(message, "billing_portal");
    return Response.json(
      { error: message, code: classified.code },
      { status: classified.status },
    );
  }
}
