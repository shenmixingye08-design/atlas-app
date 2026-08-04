import { auth } from "@clerk/nextjs/server";

import {
  ensureNotificationsHydrated,
  persistNotificationsNow,
} from "@/lib/notifications/durable";
import type { NotificationPreferences } from "@/lib/notifications/types";
import {
  getUserNotificationPreferences,
  updateUserNotificationPreferences,
} from "@/lib/notifications/service";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { error: "Unauthorized", code: "authentication_required" },
      { status: 401 },
    );
  }

  await ensureNotificationsHydrated(userId);
  return Response.json(getUserNotificationPreferences(userId));
}

export async function PATCH(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { error: "Unauthorized", code: "authentication_required" },
      { status: 401 },
    );
  }

  let body: Partial<NotificationPreferences>;
  try {
    body = (await request.json()) as Partial<NotificationPreferences>;
  } catch {
    return Response.json(
      { error: "Invalid JSON", code: "invalid_request" },
      { status: 400 },
    );
  }

  await ensureNotificationsHydrated(userId);
  const updated = updateUserNotificationPreferences(userId, body);
  // Await durable write so quiet hours / event toggles survive cold starts.
  await persistNotificationsNow(userId);
  return Response.json(updated);
}
