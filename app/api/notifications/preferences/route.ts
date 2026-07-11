import { auth } from "@clerk/nextjs/server";

import { ensureNotificationsHydrated } from "@/lib/notifications/durable";
import type { NotificationPreferences } from "@/lib/notifications/types";
import {
  getUserNotificationPreferences,
  updateUserNotificationPreferences,
} from "@/lib/notifications/service";

export async function GET(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureNotificationsHydrated(userId);
  return Response.json(getUserNotificationPreferences(userId));
}

export async function PATCH(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Partial<NotificationPreferences>;
  try {
    body = (await request.json()) as Partial<NotificationPreferences>;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updated = updateUserNotificationPreferences(userId, body);
  return Response.json(updated);
}
