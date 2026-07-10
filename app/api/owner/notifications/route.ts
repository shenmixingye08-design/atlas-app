import { listOwnerNotifications } from "@/lib/notifications/service";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";

export async function GET(): Promise<Response> {
  await requireAtlasOwner();
  const notifications = listOwnerNotifications();
  const unreadCount = notifications.filter((n) => !n.isRead).length;
  return Response.json({ notifications, unreadCount });
}
