import "server-only";

import { randomUUID } from "crypto";

import {
  appendNotification,
  deleteNotification,
  findNotification,
  getStoredPreferences,
  listStoredNotifications,
  saveStoredPreferences,
  updateNotification,
} from "./store";
import type {
  CreateNotificationInput,
  NotificationPreferences,
  NotificationRecord,
  NotificationType,
} from "./types";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "./types";

function isTypeEnabled(
  prefs: NotificationPreferences,
  type: NotificationType,
): boolean {
  if (!prefs.allEnabled || !prefs.channels.inApp) return false;
  switch (type) {
    case "completed":
      return prefs.completedEnabled;
    case "awaiting_review":
      return prefs.awaitingReviewEnabled;
    case "error":
      return prefs.errorEnabled;
    case "recommendation":
      return prefs.recommendationEnabled;
    case "billing":
      return prefs.billingEnabled;
    case "integration":
      return prefs.integrationEnabled;
    case "automation":
      return prefs.automationEnabled;
    default:
      return true;
  }
}

export function createNotification(
  input: CreateNotificationInput,
): NotificationRecord | null {
  if (input.audience === "user" && input.userId) {
    const prefs = getStoredPreferences(input.userId);
    if (!isTypeEnabled(prefs, input.type)) return null;
  }

  return appendNotification({
    notificationId: `ntf_${randomUUID()}`,
    userId: input.userId,
    audience: input.audience,
    type: input.type,
    title: input.title,
    message: input.message,
    relatedTaskId: input.relatedTaskId ?? null,
    relatedService: input.relatedService ?? null,
    isRead: false,
    createdAt: new Date().toISOString(),
    actionUrl: input.actionUrl ?? null,
  });
}

export function listUserNotifications(userId: string): NotificationRecord[] {
  return listStoredNotifications({ audience: "user", userId });
}

export function listOwnerNotifications(): NotificationRecord[] {
  return listStoredNotifications({ audience: "owner" });
}

export function countUnreadUserNotifications(userId: string): number {
  return listUserNotifications(userId).filter((n) => !n.isRead).length;
}

export function markNotificationRead(
  notificationId: string,
  userId: string,
): NotificationRecord | null {
  const record = findNotification(notificationId);
  if (!record || record.userId !== userId) return null;
  return updateNotification(notificationId, { isRead: true });
}

export function markAllUserNotificationsRead(userId: string): number {
  let count = 0;
  for (const record of listUserNotifications(userId)) {
    if (!record.isRead) {
      updateNotification(record.notificationId, { isRead: true });
      count += 1;
    }
  }
  return count;
}

export function removeUserNotification(
  notificationId: string,
  userId: string,
): boolean {
  const record = findNotification(notificationId);
  if (!record || record.userId !== userId) return false;
  return deleteNotification(notificationId);
}

export function getUserNotificationPreferences(
  userId: string,
): NotificationPreferences {
  return getStoredPreferences(userId);
}

export function updateUserNotificationPreferences(
  userId: string,
  patch: Partial<NotificationPreferences>,
): NotificationPreferences {
  const current = getStoredPreferences(userId);
  const next: NotificationPreferences = {
    ...current,
    ...patch,
    channels: { ...current.channels, ...patch.channels },
  };
  return saveStoredPreferences(userId, next);
}

export function resetUserNotificationPreferences(
  userId: string,
): NotificationPreferences {
  return saveStoredPreferences(userId, DEFAULT_NOTIFICATION_PREFERENCES);
}
