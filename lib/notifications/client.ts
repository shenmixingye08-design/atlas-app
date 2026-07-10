"use client";

import type { NotificationPreferences, NotificationRecord } from "./types";

export type NotificationsResponse = {
  notifications: NotificationRecord[];
  unreadCount: number;
};

export async function fetchNotifications(): Promise<NotificationsResponse> {
  const response = await fetch("/api/notifications");
  if (!response.ok) throw new Error("Failed to load notifications");
  return response.json() as Promise<NotificationsResponse>;
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  await fetch(`/api/notifications/${notificationId}/read`, { method: "PATCH" });
}

export async function markAllNotificationsRead(): Promise<void> {
  await fetch("/api/notifications/mark-all-read", { method: "POST" });
}

export async function deleteNotification(notificationId: string): Promise<void> {
  await fetch(`/api/notifications/${notificationId}`, { method: "DELETE" });
}

export async function fetchNotificationPreferences(): Promise<NotificationPreferences> {
  const response = await fetch("/api/notifications/preferences");
  if (!response.ok) throw new Error("Failed to load preferences");
  return response.json() as Promise<NotificationPreferences>;
}

export async function updateNotificationPreferences(
  patch: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  const response = await fetch("/api/notifications/preferences", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!response.ok) throw new Error("Failed to update preferences");
  return response.json() as Promise<NotificationPreferences>;
}
