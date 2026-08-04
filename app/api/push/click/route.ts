import { auth } from "@clerk/nextjs/server";

import {
  ensureNotificationsHydrated,
  persistNotificationsNow,
} from "@/lib/notifications/durable";
import { markNotificationRead } from "@/lib/notifications/service";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
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

  const notificationId =
    typeof (body as { notificationId?: unknown }).notificationId === "string"
      ? (body as { notificationId: string }).notificationId
      : "";

  // Test pushes use notificationId like "test" or "test-<ts>" — no inbox mark.
  if (!notificationId || notificationId === "test" || notificationId.startsWith("test-")) {
    return Response.json({ ok: true });
  }

  await ensureNotificationsHydrated(userId);
  const record = await markNotificationRead(notificationId, userId);
  if (record) {
    await persistNotificationsNow(userId);
  }

  return Response.json({ ok: true, read: Boolean(record) });
}
