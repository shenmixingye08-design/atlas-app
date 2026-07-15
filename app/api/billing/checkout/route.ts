import { auth, currentUser } from "@clerk/nextjs/server";

import { isPlanId } from "@/lib/billing/plans";
import { createCheckoutSession } from "@/lib/billing/stripe/checkout";
import {
  classifyCheckoutRouteError,
  isCheckoutBlockedError,
} from "@/lib/billing/stripe/errors";
import { assertStripeSafeForProduction } from "@/lib/billing/stripe/production-guard";
import { resolveUserSubscriptionDurable } from "@/lib/billing/subscriptions/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveRequestOrigin(request: Request): string {
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
    // Dynamic import keeps OpenAI / owner notification graph off the cold-start path.
    const { recordStripeFailure } = await import(
      "@/lib/owner/error-monitoring/telemetry"
    );
    recordStripeFailure(message, source);
  } catch (telemetryError) {
    console.error("[billing/checkout] recordStripeFailure failed", {
      source,
      message:
        telemetryError instanceof Error
          ? telemetryError.message
          : "unknown telemetry error",
    });
  }
}

export async function POST(request: Request): Promise<Response> {
  console.info("[billing/checkout] POST start");

  try {
    const { userId } = await auth();
    if (!userId) {
      console.info("[billing/checkout] unauthorized");
      return Response.json(
        { error: "Unauthorized", code: "unauthorized" },
        { status: 401 },
      );
    }

    try {
      assertStripeSafeForProduction();
    } catch (error) {
      const classified = classifyCheckoutRouteError(error);
      console.error("[billing/checkout] production guard failed", {
        code: classified.code,
        message: classified.logMessage,
      });
      await safeRecordStripeFailure(classified.logMessage, "billing_checkout");
      return Response.json(
        { error: classified.userMessage, code: classified.code },
        { status: classified.status },
      );
    }

    const body = (await request.json().catch(() => null)) as {
      planId?: unknown;
      priceId?: unknown;
    } | null;

    // Clients may only select a plan — never a free-form Price ID or amount.
    if (body?.priceId != null) {
      console.warn("[billing/checkout] rejected client priceId");
      return Response.json(
        { error: "Invalid request", code: "invalid_request" },
        { status: 400 },
      );
    }

    const planId = typeof body?.planId === "string" ? body.planId : null;
    if (!planId || !isPlanId(planId)) {
      console.warn("[billing/checkout] invalid plan", { planId });
      return Response.json(
        { error: "Invalid plan", code: "invalid_plan" },
        { status: 400 },
      );
    }

    if (planId === "free") {
      return Response.json(
        {
          error: "Free plan does not require checkout",
          code: "free_plan",
        },
        { status: 400 },
      );
    }

    console.info("[billing/checkout] creating session", { planId, userId });

    const user = await currentUser();
    const email =
      user?.primaryEmailAddress?.emailAddress ??
      user?.emailAddresses[0]?.emailAddress ??
      null;

    const subscription = await resolveUserSubscriptionDurable(userId);

    const session = await createCheckoutSession({
      userId,
      planId,
      customerEmail: email,
      origin: resolveRequestOrigin(request),
      existingStripeCustomerId: subscription.stripeCustomerId,
    });

    console.info("[billing/checkout] session created", {
      planId,
      mode: session.mode,
      sessionId: session.sessionId,
    });

    return Response.json({
      url: session.url,
      sessionId: session.sessionId,
      mode: session.mode,
    });
  } catch (error) {
    if (isCheckoutBlockedError(error)) {
      // Delegate status: already_same_plan / use_portal → 409; price_mismatch → 400
      const classified = classifyCheckoutRouteError(error);
      console.info("[billing/checkout] blocked", {
        code: classified.code,
        status: classified.status,
        message: classified.logMessage,
      });
      return Response.json(
        { error: classified.userMessage, code: classified.code },
        { status: classified.status },
      );
    }

    const classified = classifyCheckoutRouteError(error);
    console.error("[billing/checkout] failed", {
      code: classified.code,
      status: classified.status,
      message: classified.logMessage,
    });
    await safeRecordStripeFailure(classified.logMessage, "billing_checkout");
    return Response.json(
      { error: classified.userMessage, code: classified.code },
      { status: classified.status },
    );
  }
}
