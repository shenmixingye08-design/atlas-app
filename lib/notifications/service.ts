import "server-only";

import { randomUUID } from "crypto";

import { dispatchLineNotification } from "@/lib/integrations/line/service";
import { dispatchWebPushNotification } from "@/lib/push/dispatch";
import { resolvePushEventCategory, resolvePushSeverity } from "@/lib/push/categories";

import { schedulePersistNotifications } from "./durable";
import { countUnreadNotifications } from "./unread-rules";
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
    case "awaiting_review":
      return "confirmation_request";
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

  // The notification id is the canonical key of the unified results route. When
  // a result target is present, the button MUST open `/results/<id>` (which
  // resolves the exact 成果物 from the notification alone) — not a stale
  // `/projects/<id>` deep link that can dead-end.
  const notificationId = `ntf_${randomUUID()}`;
  const targetType = input.targetType ?? null;
  const targetId = input.targetId ?? null;
  const canonicalActionUrl =
    targetType && targetId
      ? `/results/${encodeURIComponent(notificationId)}`
      : (input.actionUrl ?? null);

  // Send the LINE message with the same canonical link the in-app button uses.
  // LINE dispatch is independent of the in-app channel preference (each channel
  // is gated separately inside the LINE service).
  if (input.audience === "user" && input.userId && lineEvent) {
    void dispatchLineNotification({
      userId: input.userId,
      event: lineEvent,
      title: input.title,
      message: input.message,
      actionUrl: canonicalActionUrl,
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
    notificationId,
    userId: input.userId,
    audience: input.audience,
    type: input.type,
    title: input.title,
    message: input.message,
    relatedTaskId: input.relatedTaskId ?? null,
    relatedService: input.relatedService ?? null,
    isRead: false,
    createdAt: new Date().toISOString(),
    actionUrl: canonicalActionUrl,
    lineEvent,
    targetType,
    targetId,
    workflowRunId: input.workflowRunId ?? null,
    deliverableId: input.deliverableId ?? null,
    requestId: input.requestId ?? null,
    automationId: input.automationId ?? null,
    severity:
      input.severity ??
      resolvePushSeverity({
        type: input.type,
        severity: input.severity ?? null,
        eventCategory: input.eventCategory ?? null,
      }),
    eventCategory:
      input.eventCategory ??
      resolvePushEventCategory({
        type: input.type,
        eventCategory: input.eventCategory ?? null,
        autoRecovered: input.autoRecovered,
      }),
    pushSentAt: null,
    pushFailedAt: null,
    pushFailureReason: null,
    readAt: null,
  });
  if (input.userId) schedulePersistNotifications(input.userId);

  if (input.audience === "user" && input.userId) {
    void dispatchWebPushNotification({
      userId: input.userId,
      record,
      eventCategory: record.eventCategory ?? null,
      severity: record.severity ?? null,
      autoRecovered: input.autoRecovered,
      jobName: input.jobName ?? null,
      jobId: input.workflowRunId ?? null,
    }).catch((error) => {
      console.warn("[push notify]", error);
    });
  }

  return record;
}

export function listUserNotifications(userId: string): NotificationRecord[] {
  return listStoredNotifications({ audience: "user", userId });
}

export function listOwnerNotifications(): NotificationRecord[] {
  return listStoredNotifications({ audience: "owner" });
}

export function countUnreadUserNotifications(userId: string): number {
  return countUnreadNotifications(listUserNotifications(userId));
}

export function markNotificationRead(
  notificationId: string,
  userId: string,
): NotificationRecord | null {
  const record = findNotification(notificationId);
  if (!record || record.userId !== userId) return null;
  const updated = updateNotification(notificationId, {
    isRead: true,
    readAt: new Date().toISOString(),
  });
  schedulePersistNotifications(userId);
  return updated;
}

export function markAllUserNotificationsRead(userId: string): number {
  let count = 0;
  for (const record of listUserNotifications(userId)) {
    if (!record.isRead) {
      updateNotification(record.notificationId, {
        isRead: true,
        readAt: new Date().toISOString(),
      });
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
    push: {
      ...current.push,
      ...patch.push,
      events: { ...current.push.events, ...patch.push?.events },
      severities: { ...current.push.severities, ...patch.push?.severities },
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
