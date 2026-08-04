import { auth } from "@clerk/nextjs/server";

import {
  ensureNotificationsHydrated,
  persistNotificationsNow,
} from "@/lib/notifications/durable";
import { markAllUserNotificationsRead } from "@/lib/notifications/service";

export async function POST(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureNotificationsHydrated(userId);

  const count = await markAllUserNotificationsRead(userId);
  if (count > 0) {
    await persistNotificationsNow(userId);
  }
  return Response.json({ marked: count });
}
