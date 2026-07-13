import { auth } from "@clerk/nextjs/server";

import { resolveUserSubscriptionDurable } from "@/lib/billing/subscriptions/store";
import { createBillingPortalSession } from "@/lib/billing/stripe/checkout";
import { assertStripeSafeForProduction } from "@/lib/billing/stripe/production-guard";

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
 * Never accepts a client-supplied customer ID.
 *
 * Card change / invoices / cancel / plan change are Stripe Portal (Dashboard)
 * features — this route only creates a portal session and returns its URL.
 * return_url is always /settings/billing.
 */
export async function POST(request: Request): Promise<Response> {
  console.info("[billing/portal] POST start");

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
        error instanceof Error ? error.message : "Stripe is not configured";
      console.error("[billing/portal] production guard failed", { message });
      await safeRecordStripeFailure(message, "billing_portal");
      return Response.json(
        { error: PORTAL_USER_ERROR_MESSAGE, code: "stripe_not_configured" },
        { status: 503 },
      );
    }

    // Ignore any client body — customer ID comes only from durable subscription store.
    const subscription = await resolveUserSubscriptionDurable(userId);
    if (!subscription.stripeCustomerId) {
      return Response.json(
        { error: NO_CUSTOMER_MESSAGE, code: "no_customer" },
        { status: 400 },
      );
    }

    const portal = await createBillingPortalSession({
      stripeCustomerId: subscription.stripeCustomerId,
      origin: resolveOrigin(request),
    });

    console.info("[billing/portal] session created", { mode: portal.mode });
    return Response.json(portal);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to open billing portal";
    console.error("[billing/portal] failed", { message });
    await safeRecordStripeFailure(message, "billing_portal");
    return Response.json(
      { error: PORTAL_USER_ERROR_MESSAGE, code: "portal_failed" },
      { status: 500 },
    );
  }
}
