import { auth } from "@clerk/nextjs/server";

import {
  ensureNotificationsHydrated,
  persistNotificationsNow,
} from "@/lib/notifications/durable";
import { markNotificationRead } from "@/lib/notifications/service";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureNotificationsHydrated(userId);

  const { id } = await context.params;
  const record = await markNotificationRead(id, userId);
  if (!record) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  await persistNotificationsNow(userId);

  return Response.json(record);
}
