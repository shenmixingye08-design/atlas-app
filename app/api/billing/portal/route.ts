import { auth } from "@clerk/nextjs/server";

import { resolveUserSubscription } from "@/lib/billing/subscriptions/service";
import { createBillingPortalSession } from "@/lib/billing/stripe/checkout";
import { recordStripeFailure } from "@/lib/owner/error-monitoring/telemetry";

function resolveOrigin(request: Request): string {
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

  const subscription = resolveUserSubscription(userId);
  if (!subscription.stripeCustomerId) {
    return Response.json(
      { error: "No Stripe customer on file" },
      { status: 400 },
    );
  }

  try {
    const portal = await createBillingPortalSession({
      stripeCustomerId: subscription.stripeCustomerId,
      origin: resolveOrigin(request),
    });

    return Response.json(portal);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to open billing portal";
    recordStripeFailure(message, "billing_portal");
    return Response.json({ error: message }, { status: 500 });
  }
}
