import { auth } from "@clerk/nextjs/server";

import { deactivatePushSubscription } from "@/lib/push/subscription-store";

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { endpoint?: string };
  if (!body.endpoint) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  await deactivatePushSubscription({ userId, endpoint: body.endpoint });
  return Response.json({ ok: true });
}
