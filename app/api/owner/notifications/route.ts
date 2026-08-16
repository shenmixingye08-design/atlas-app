import { listOwnerNotifications } from "@/lib/notifications/service";
import { requireAtlasOwnerApi } from "@/lib/auth/require-atlas-owner";

export async function GET(): Promise<Response> {
  const owner = await requireAtlasOwnerApi();
  if (!owner.ok) return owner.response;
  const notifications = listOwnerNotifications();
  const unreadCount = notifications.filter((n) => !n.isRead).length;
  return Response.json({ notifications, unreadCount });
}
