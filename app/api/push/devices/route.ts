import { auth } from "@clerk/nextjs/server";

import {
  listAllPushSubscriptions,
  setPushSubscriptionActive,
} from "@/lib/push/subscription-store";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { error: "Unauthorized", code: "authentication_required" },
      { status: 401 },
    );
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
      lastUsedAt: d.lastUsedAt,
    })),
  });
}

export async function PATCH(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { error: "Unauthorized", code: "authentication_required" },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Invalid JSON", code: "invalid_request" },
      { status: 400 },
    );
  }

  const payload = body as {
    subscriptionId?: unknown;
    isActive?: unknown;
  };

  if (
    typeof payload.subscriptionId !== "string" ||
    typeof payload.isActive !== "boolean"
  ) {
    return Response.json(
      { error: "Invalid request", code: "invalid_request" },
      { status: 400 },
    );
  }

  const ok = await setPushSubscriptionActive({
    userId,
    subscriptionId: payload.subscriptionId,
    isActive: payload.isActive,
  });

  if (!ok) {
    return Response.json(
      { error: "Not found", code: "invalid_request" },
      { status: 404 },
    );
  }

  return Response.json({ ok: true });
}
