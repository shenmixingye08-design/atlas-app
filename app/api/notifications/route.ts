import { auth } from "@clerk/nextjs/server";

import { ensureNotificationsHydrated } from "@/lib/notifications/durable";
import { listUserNotifications } from "@/lib/notifications/service";
import { syncRecommendationNotifications } from "@/lib/notifications/recommendation-sync";

export async function GET(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureNotificationsHydrated(userId);
  // P09: recommendation sync is cooldown-gated (avoids automation.list every poll).
  await syncRecommendationNotifications(userId);

  // Single list read — derive unreadCount (was a second full list/count).
  const notifications = await listUserNotifications(userId);
  const unreadCount = notifications.reduce(
    (n, row) => n + (row.isRead ? 0 : 1),
    0,
  );

  return Response.json({
    notifications,
    unreadCount,
  });
}
