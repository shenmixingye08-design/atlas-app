import { auth } from "@clerk/nextjs/server";
import { connection } from "next/server";

import { getUserBillingSummary } from "@/lib/billing/service";
import { resolveUserSubscriptionDurable } from "@/lib/billing/subscriptions/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  // Force a request-time dynamic boundary before reading Stripe env.
  await connection();

  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await resolveUserSubscriptionDurable(userId);
  return Response.json(getUserBillingSummary(userId), {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
