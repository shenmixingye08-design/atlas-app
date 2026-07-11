import "server-only";

import { randomUUID } from "crypto";

import { dispatchLineNotification } from "@/lib/integrations/line/service";

import { schedulePersistNotifications } from "./durable";
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
  LineNotifyEvent,
  NotificationPreferences,
  NotificationRecord,
  NotificationType,
} from "./types";
import {
  DEFAULT_LINE_EVENTS,
  DEFAULT_NOTIFICATION_PREFERENCES,
} from "./types";

function isInAppTypeEnabled(
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

function resolveLineEvent(
  input: CreateNotificationInput,
): LineNotifyEvent | null {
  if (input.lineEvent) return input.lineEvent;
  switch (input.type) {
    case "completed":
      return "work_completed";
    case "error":
    case "integration":
      return "error";
    case "automation":
      return "automation_completed";
    default:
      return null;
  }
}

export function createNotification(
  input: CreateNotificationInput,
): NotificationRecord | null {
  const lineEvent = resolveLineEvent(input);

  if (input.audience === "user" && input.userId && lineEvent) {
    void dispatchLineNotification({
      userId: input.userId,
      event: lineEvent,
      title: input.title,
      message: input.message,
      actionUrl: input.actionUrl,
    }).catch((error) => {
      console.warn("[LINE notify]", error);
    });
  }

  if (input.audience === "user" && input.userId) {
    const prefs = getStoredPreferences(input.userId);
    if (!isInAppTypeEnabled(prefs, input.type)) {
      return null;
    }
  }

  const record = appendNotification({
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
    lineEvent,
  });
  if (input.userId) schedulePersistNotifications(input.userId);
  return record;
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
  const updated = updateNotification(notificationId, { isRead: true });
  schedulePersistNotifications(userId);
  return updated;
}

export function markAllUserNotificationsRead(userId: string): number {
  let count = 0;
  for (const record of listUserNotifications(userId)) {
    if (!record.isRead) {
      updateNotification(record.notificationId, { isRead: true });
      count += 1;
    }
  }
  if (count > 0) schedulePersistNotifications(userId);
  return count;
}

export function removeUserNotification(
  notificationId: string,
  userId: string,
): boolean {
  const record = findNotification(notificationId);
  if (!record || record.userId !== userId) return false;
  const removed = deleteNotification(notificationId);
  if (removed) schedulePersistNotifications(userId);
  return removed;
}

export function getUserNotificationPreferences(
  userId: string,
): NotificationPreferences {
  return getStoredPreferences(userId);
}

export function updateUserNotificationPreferences(
  userId: string,
  patch: Partial<NotificationPreferences> & {
    channels?: Partial<NotificationPreferences["channels"]>;
    lineEvents?: Partial<NotificationPreferences["lineEvents"]>;
  },
): NotificationPreferences {
  const current = getStoredPreferences(userId);
  const next: NotificationPreferences = {
    ...current,
    ...patch,
    channels: { ...current.channels, ...patch.channels },
    lineEvents: {
      ...DEFAULT_LINE_EVENTS,
      ...current.lineEvents,
      ...patch.lineEvents,
    },
  };
  const saved = saveStoredPreferences(userId, next);
  schedulePersistNotifications(userId);
  return saved;
}

export function resetUserNotificationPreferences(
  userId: string,
): NotificationPreferences {
  const saved = saveStoredPreferences(
    userId,
    DEFAULT_NOTIFICATION_PREFERENCES,
  );
  schedulePersistNotifications(userId);
  return saved;
}
