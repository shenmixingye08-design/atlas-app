import { auth } from "@clerk/nextjs/server";

import { getUserBillingSummary } from "@/lib/billing/service";

export async function GET(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return Response.json(getUserBillingSummary(userId));
}
