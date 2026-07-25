import { auth } from "@clerk/nextjs/server";

import {
  ensureNotificationsHydrated,
  persistNotificationsNow,
} from "@/lib/notifications/durable";
import { markNotificationRead } from "@/lib/notifications/service";

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { notificationId?: string };
  if (!body.notificationId || body.notificationId === "test") {
    return Response.json({ ok: true });
  }

  await ensureNotificationsHydrated(userId);
  const record = markNotificationRead(body.notificationId, userId);
  if (record) {
    await persistNotificationsNow(userId);
  }

  return Response.json({ ok: true, read: Boolean(record) });
}
