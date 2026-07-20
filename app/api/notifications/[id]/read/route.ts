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

  // Serverless instances may be cold: load durable notifications before
  // mutating in-memory state, otherwise the record is missing and the
  // request 404s (notification stays unread — "opening does nothing").
  await ensureNotificationsHydrated(userId);

  const { id } = await context.params;
  const record = markNotificationRead(id, userId);
  if (!record) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  // Await durable write: serverless may freeze before fire-and-forget persist
  // completes, otherwise the read state is lost on the next cold start.
  await persistNotificationsNow(userId);

  return Response.json(record);
}
