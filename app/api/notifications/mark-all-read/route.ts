import { auth } from "@clerk/nextjs/server";

import { ensureNotificationsHydrated } from "@/lib/notifications/durable";
import { markAllUserNotificationsRead } from "@/lib/notifications/service";

export async function POST(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Load durable notifications first so cold instances can mark them read.
  await ensureNotificationsHydrated(userId);

  const count = markAllUserNotificationsRead(userId);
  return Response.json({ marked: count });
}
