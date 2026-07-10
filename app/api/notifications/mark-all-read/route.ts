import { auth } from "@clerk/nextjs/server";

import { markAllUserNotificationsRead } from "@/lib/notifications/service";

export async function POST(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const count = markAllUserNotificationsRead(userId);
  return Response.json({ marked: count });
}
