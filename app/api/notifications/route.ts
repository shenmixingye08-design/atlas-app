import { auth } from "@clerk/nextjs/server";

import {
  countUnreadUserNotifications,
  listUserNotifications,
} from "@/lib/notifications/service";
import { syncRecommendationNotifications } from "@/lib/notifications/recommendation-sync";

export async function GET(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await syncRecommendationNotifications(userId);

  const notifications = listUserNotifications(userId);
  return Response.json({
    notifications,
    unreadCount: countUnreadUserNotifications(userId),
  });
}
