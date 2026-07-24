import { auth } from "@clerk/nextjs/server";

import { upsertPushSubscription } from "@/lib/push/subscription-store";

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    endpoint?: string;
    p256dh?: string;
    authKey?: string;
    platform?: string | null;
    browser?: string | null;
    deviceName?: string | null;
  };

  if (!body.endpoint || !body.p256dh || !body.authKey) {
    return Response.json({ error: "Invalid subscription" }, { status: 400 });
  }

  const record = await upsertPushSubscription({
    userId,
    endpoint: body.endpoint,
    p256dh: body.p256dh,
    authKey: body.authKey,
    platform: body.platform ?? null,
    browser: body.browser ?? null,
    deviceName: body.deviceName ?? null,
  });

  if (!record) {
    return Response.json({ error: "Persistence unavailable" }, { status: 503 });
  }

  return Response.json({ subscription: record });
}
