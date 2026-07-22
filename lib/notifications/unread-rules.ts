import type { NotificationRecord } from "./types";

/** Unread when explicitly not marked read — opening the list does not change this. */
export function isNotificationUnread(record: NotificationRecord): boolean {
  return !record.isRead;
}

/** Badge count: one DB record → one unread regardless of push/inbox duplication. */
export function countUnreadNotifications(
  records: readonly NotificationRecord[],
): number {
  return records.filter(isNotificationUnread).length;
}

/** Mark-read applies to exactly one notification id. */
export function shouldDecrementUnreadCount(
  record: NotificationRecord,
): boolean {
  return isNotificationUnread(record);
}
