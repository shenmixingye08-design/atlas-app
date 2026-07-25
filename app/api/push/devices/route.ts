import { auth } from "@clerk/nextjs/server";

import {
  listAllPushSubscriptions,
  setPushSubscriptionActive,
} from "@/lib/push/subscription-store";

export async function GET(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const devices = await listAllPushSubscriptions(userId);
  return Response.json({
    devices: devices.map((d) => ({
      id: d.id,
      platform: d.platform,
      browser: d.browser,
      deviceName: d.deviceName,
      isActive: d.isActive,
      failureCount: d.failureCount,
      updatedAt: d.updatedAt,
    })),
  });
}

export async function PATCH(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    subscriptionId?: string;
    isActive?: boolean;
  };

  if (!body.subscriptionId || typeof body.isActive !== "boolean") {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const ok = await setPushSubscriptionActive({
    userId,
    subscriptionId: body.subscriptionId,
    isActive: body.isActive,
  });

  if (!ok) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
