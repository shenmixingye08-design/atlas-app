import { auth } from "@clerk/nextjs/server";

import {
  ensureNotificationsHydrated,
  persistNotificationsNow,
} from "@/lib/notifications/durable";
import { removeUserNotification } from "@/lib/notifications/service";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Load durable notifications first so cold instances can locate the record.
  await ensureNotificationsHydrated(userId);

  const { id } = await context.params;
  const removed = removeUserNotification(id, userId);
  if (!removed) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  // Await durable write so the deletion survives serverless cold starts.
  await persistNotificationsNow(userId);

  return Response.json({ ok: true });
}
