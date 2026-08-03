import "server-only";

import { randomUUID } from "crypto";

import { resolvePushEventCategory, resolvePushSeverity } from "@/lib/push/categories";

import { deliverLineWithAck, deliverWebPushWithAck } from "./delivery";
import { schedulePersistNotifications } from "./durable";
import { bumpPersistenceCounter } from "@/lib/persistence/call-counters";
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
import { resolveNotificationPreferencesWithMemorySync } from "@/lib/memory-apply/notifications";

function isInAppTypeEnabled(
  prefs: NotificationPreferences,
  type: NotificationType,
): boolean {
  if (!prefs.allEnabled || !prefs.channels.inApp) return false;
  return isNotificationTypeEnabled(prefs, type);
}

function isNotificationTypeEnabled(
  prefs: NotificationPreferences,
  type: NotificationType,
): boolean {
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

function isLineDeliveryEnabled(
  prefs: NotificationPreferences,
  type: NotificationType,
  lineEvent: LineNotifyEvent | null,
): lineEvent is LineNotifyEvent {
  if (!lineEvent) return false;
  if (!prefs.allEnabled || !isNotificationTypeEnabled(prefs, type)) return false;
  if (!prefs.channels.line) return false;
  return prefs.lineEvents[lineEvent] === true;
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
  options?: { skipDelivery?: boolean },
): NotificationRecord | null {
  const lineEvent = resolveLineEvent(input);
  let shouldCreateInApp = true;
  let enabledLineEvent: LineNotifyEvent | null = null;

  if (input.audience === "user" && input.userId) {
    const stored = getStoredPreferences(input.userId);
    const { preferences: prefs } = resolveNotificationPreferencesWithMemorySync({
      userId: input.userId,
      base: stored,
    });
    if (!prefs.allEnabled) {
      return null;
    }

    shouldCreateInApp = isInAppTypeEnabled(prefs, input.type);
    enabledLineEvent = isLineDeliveryEnabled(prefs, input.type, lineEvent)
      ? lineEvent
      : null;

    if (!shouldCreateInApp && !enabledLineEvent) {
      return null;
    }
  }

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

  if (!shouldCreateInApp) {
    if (
      !options?.skipDelivery &&
      input.audience === "user" &&
      input.userId &&
      enabledLineEvent
    ) {
      void deliverLineWithAck({
        notificationId,
        userId: input.userId,
        event: enabledLineEvent,
        title: input.title,
        message: input.message,
        actionUrl: canonicalActionUrl,
      }).catch((error) => console.warn("[LINE notify]", error));
    }
    return null;
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
  bumpPersistenceCounter("notificationCreate");
  if (input.userId) schedulePersistNotifications(input.userId);

  if (!options?.skipDelivery) {
    // Delivery with ACK → Retry → DLQ. Scheduled (not blocking create), but never
    // counted as success until deliver*WithAck completes.
    if (input.audience === "user" && input.userId && enabledLineEvent) {
      void deliverLineWithAck({
        notificationId,
        userId: input.userId,
        event: enabledLineEvent,
        title: input.title,
        message: input.message,
        actionUrl: canonicalActionUrl,
      }).catch((error) => console.warn("[LINE notify]", error));
    }

    if (input.audience === "user" && input.userId) {
      void deliverWebPushWithAck({
        record,
        autoRecovered: input.autoRecovered,
        jobName: input.jobName ?? null,
      }).catch((error) => console.warn("[push notify]", error));
    }
  }

  return record;
}

/** Awaited notification create for E2E reliability harnesses. */
export async function createNotificationWithDelivery(
  input: CreateNotificationInput,
): Promise<{
  record: NotificationRecord | null;
  lineOk: boolean | null;
  pushOk: boolean | null;
}> {
  const lineEvent = resolveLineEvent(input);
  const record = createNotification(input, { skipDelivery: true });
  if (!record || !input.userId) {
    return { record, lineOk: null, pushOk: null };
  }

  let lineOk: boolean | null = null;
  let pushOk: boolean | null = null;
  const prefs = getStoredPreferences(input.userId);
  const enabledLineEvent = isLineDeliveryEnabled(prefs, input.type, lineEvent)
    ? lineEvent
    : null;
  if (enabledLineEvent) {
    const line = await deliverLineWithAck({
      notificationId: record.notificationId,
      userId: input.userId,
      event: enabledLineEvent,
      title: input.title,
      message: input.message,
      actionUrl: record.actionUrl,
    });
    lineOk = line.ok;
  }
  const push = await deliverWebPushWithAck({
    record,
    autoRecovered: input.autoRecovered,
    jobName: input.jobName ?? null,
  });
  pushOk = push.ok;
  return { record, lineOk, pushOk };
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
