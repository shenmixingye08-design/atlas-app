import { auth, currentUser } from "@clerk/nextjs/server";

import { isPlanId } from "@/lib/billing/plans";
import { createCheckoutSession } from "@/lib/billing/stripe/checkout";
import { CHECKOUT_USER_ERROR_MESSAGE } from "@/lib/billing/stripe/errors";
import { resolveUserSubscription } from "@/lib/billing/subscriptions/service";
import { recordStripeFailure } from "@/lib/owner/error-monitoring/telemetry";

function resolveRequestOrigin(request: Request): string {
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ?? "http";

  if (host) {
    return `${protocol}://${host}`;
  }

  return new URL(request.url).origin;
}

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    planId?: unknown;
    priceId?: unknown;
  } | null;

  // Clients may only select a plan — never a free-form Price ID.
  if (body?.priceId != null) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const planId = typeof body?.planId === "string" ? body.planId : null;
  if (!planId || !isPlanId(planId)) {
    return Response.json({ error: "Invalid plan" }, { status: 400 });
  }

  if (planId === "free") {
    return Response.json(
      { error: "Free plan does not require checkout" },
      { status: 400 },
    );
  }

  try {
    const user = await currentUser();
    const email =
      user?.primaryEmailAddress?.emailAddress ??
      user?.emailAddresses[0]?.emailAddress ??
      null;

    const subscription = resolveUserSubscription(userId);

    const session = await createCheckoutSession({
      userId,
      planId,
      customerEmail: email,
      origin: resolveRequestOrigin(request),
      existingStripeCustomerId: subscription.stripeCustomerId,
    });

    return Response.json({
      url: session.url,
      sessionId: session.sessionId,
      mode: session.mode,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create checkout session";
    recordStripeFailure(message, "billing_checkout");
    return Response.json({ error: CHECKOUT_USER_ERROR_MESSAGE }, { status: 500 });
  }
}
