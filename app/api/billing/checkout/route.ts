import { isPlanId } from "@/lib/billing/plans";
import { createCheckoutSession } from "@/lib/billing/stripe/checkout";
import {
  classifyCheckoutRouteError,
  isCheckoutBlockedError,
} from "@/lib/billing/stripe/errors";
import { assertStripeSafeForProduction } from "@/lib/billing/stripe/production-guard";
import { resolveUserSubscriptionDurable } from "@/lib/billing/subscriptions/store";
import { enforceApiSecurity } from "@/lib/security/api/gate";
import {
  assertCheckoutNotDuplicate,
  auditBillingOperation,
  validateCheckoutPayload,
} from "@/lib/security/billing/billing-security";
import { recordAuditLogSafe } from "@/lib/owner/audit-log/record";
import { secureLog } from "@/lib/security/secrets/redact";

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
  secureLog("info", "[billing/checkout] POST start");

  try {
    const gate = await enforceApiSecurity({
      request,
      resource: "billing",
      action: "checkout",
      rateLimit: { max: 10, windowMs: 60_000, minIntervalMs: 1_000 },
      csrf: true,
      replay: false,
      validate: () => ({ ok: true }),
    });
    if (!gate.ok) return gate.response;
    const { userId, email, request_id } = gate;

    try {
      assertStripeSafeForProduction();
    } catch (error) {
      const classified = classifyCheckoutRouteError(error);
      secureLog("error", "[billing/checkout] production guard failed", {
        code: classified.code,
        message: classified.logMessage,
      });
      await safeRecordStripeFailure(classified.logMessage, "billing_checkout");
      return Response.json(
        {
          error: classified.userMessage,
          code: classified.code,
          request_id,
        },
        { status: classified.status },
      );
    }

    const body = (await request.json().catch(() => null)) as {
      planId?: unknown;
      priceId?: unknown;
    } | null;

    // Clients may only select a plan — never a free-form Price ID or amount.
    if (body?.priceId != null) {
      secureLog("warn", "[billing/checkout] rejected client priceId");
      return Response.json(
        { error: "Invalid request", code: "invalid_request", request_id },
        { status: 400 },
      );
    }

    const validated = validateCheckoutPayload({
      planId: body?.planId,
      priceId: body?.priceId,
    });
    if (!validated.ok) {
      secureLog("warn", "[billing/checkout] invalid plan", {
        reason: validated.reason,
      });
      return Response.json(
        {
          error: validated.reason,
          code: validated.reason.includes("Free")
            ? "free_plan"
            : "invalid_plan",
          request_id,
        },
        { status: 400 },
      );
    }
    const { planId } = validated;
    if (!isPlanId(planId)) {
      return Response.json(
        { error: "Invalid plan", code: "invalid_plan", request_id },
        { status: 400 },
      );
    }

    const duplicate = assertCheckoutNotDuplicate({ userId, planId });
    if (!duplicate.ok) {
      return Response.json(
        {
          error: duplicate.reason,
          code: "duplicate_checkout",
          request_id: duplicate.request_id,
        },
        { status: 409 },
      );
    }

    secureLog("info", "[billing/checkout] creating session", { planId, userId });

    const subscription = await resolveUserSubscriptionDurable(userId);

    const session = await createCheckoutSession({
      userId,
      planId,
      customerEmail: email,
      origin: resolveRequestOrigin(request),
      existingStripeCustomerId: subscription.stripeCustomerId,
    });

    auditBillingOperation({
      userId,
      operation: "checkout",
      success: true,
      reason: `session:${session.sessionId}`,
      requestId: request_id,
    });
    recordAuditLogSafe({
      userId,
      email,
      category: "billing",
      action: "stripe_payment",
      targetId: planId,
      result: "success",
      reason: "checkout_session_created",
      requestId: request_id,
    });

    secureLog("info", "[billing/checkout] session created", {
      planId,
      mode: session.mode,
      sessionId: session.sessionId,
    });

    return Response.json({
      url: session.url,
      sessionId: session.sessionId,
      mode: session.mode,
      request_id,
    });
  } catch (error) {
    if (isCheckoutBlockedError(error)) {
      // Delegate status: already_same_plan / use_portal → 409; price_mismatch → 400
      const classified = classifyCheckoutRouteError(error);
      secureLog("info", "[billing/checkout] blocked", {
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
    secureLog("error", "[billing/checkout] failed", {
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
