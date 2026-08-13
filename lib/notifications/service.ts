import "server-only";

import { randomUUID } from "crypto";

import {
  resolvePushEventCategory,
  resolvePushSeverity,
} from "@/lib/push/categories";

import { deliverLineWithAck, deliverWebPushWithAck } from "./delivery";
import { schedulePersistNotifications } from "./durable";
import {
  buildNotificationIdempotencyKey,
  countDurableUnread,
  getDurableNotification,
  insertDurableNotification,
  listDurableNotifications,
  markAllDurableNotificationsRead,
  markDurableNotificationRead,
  NotificationInboxUnavailableError,
  scheduleDurableDeliveryRetry,
  softDeleteDurableNotification,
  updateDurableDeliveryState,
} from "./durable-inbox";
import { isNotificationDurableRequired } from "./notification-backend";
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

function isPushChannelEnabled(prefs: NotificationPreferences): boolean {
  return prefs.allEnabled && prefs.channels.push === true;
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

/**
 * Formal P0-4 create: Durable inbox insert BEFORE external delivery.
 * Production never succeeds on process-memory alone.
 */
export async function createUserNotification(
  input: CreateNotificationInput,
  options?: { skipDelivery?: boolean; eventVersion?: string },
): Promise<NotificationRecord | null> {
  const lineEvent = resolveLineEvent(input);
  let shouldCreateInApp = true;
  let enabledLineEvent: LineNotifyEvent | null = null;
  let shouldAttemptPush = false;

  if (input.audience === "user") {
    if (!input.userId?.trim()) {
      throw new NotificationInboxUnavailableError(
        "[notifications] P0-4: user audience requires ownerId/userId",
      );
    }
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
    shouldAttemptPush = isPushChannelEnabled(prefs);

    if (!shouldCreateInApp && !enabledLineEvent && !shouldAttemptPush) {
      return null;
    }
  }

  const notificationId = `ntf_${randomUUID()}`;
  const targetType = input.targetType ?? null;
  const targetId = input.targetId ?? null;
  const canonicalActionUrl =
    targetType && targetId
      ? `/results/${encodeURIComponent(notificationId)}`
      : (input.actionUrl ?? null);

  // Prefer in-app durable row. LINE/push-only prefs still get a durable row
  // first so external delivery never succeeds without SoT persistence.
  if (
    !shouldCreateInApp &&
    !(input.audience === "user" && (enabledLineEvent || shouldAttemptPush))
  ) {
    return null;
  }

  const draft: NotificationRecord = {
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
        lineEvent,
      }),
    pushSentAt: null,
    pushFailedAt: null,
    pushFailureReason: null,
    readAt: null,
  };

  const sourceId =
    input.requestId ??
    input.relatedTaskId ??
    input.deliverableId ??
    input.automationId ??
    input.workflowRunId ??
    notificationId;

  const idempotencyKey = buildNotificationIdempotencyKey({
    ownerId: input.userId ?? "owner",
    eventType: input.type,
    sourceId,
    channel: "in_app",
    eventVersion: options?.eventVersion ?? "v1",
  });

  // P0-4: Durable insert first (fail-closed). Cache is secondary.
  let record: NotificationRecord;
  let created = true;
  if (input.audience === "user" && input.userId) {
    const inserted = await insertDurableNotification(draft, {
      idempotencyKey,
      sourceType: input.type,
      sourceId,
      channel: shouldCreateInApp
        ? "in_app"
        : enabledLineEvent
          ? "line"
          : "push",
      organizationId: input.organizationId ?? null,
    });
    record = inserted.record;
    created = inserted.created;
    if (shouldCreateInApp) {
      appendNotification(record);
    }
  } else {
    // Owner-audience: still cache locally; not a multi-tenant user inbox.
    record = appendNotification(draft);
  }

  bumpPersistenceCounter("notificationCreate");
  // Legacy blob snapshot kept for prefs; row SoT is durable-inbox.
  if (input.userId) schedulePersistNotifications(input.userId);

  // P1-02: idempotent reuse must not re-fire external channels.
  // Retry redelivery is owned exclusively by processDurableNotificationRetries.
  if (
    !options?.skipDelivery &&
    created &&
    input.audience === "user" &&
    input.userId
  ) {
    let channelOk = true;
    let lastError: string | null = null;

    if (enabledLineEvent) {
      const line = await deliverLineWithAck({
        notificationId: record.notificationId,
        userId: input.userId,
        event: enabledLineEvent,
        title: input.title,
        message: input.message,
        actionUrl: canonicalActionUrl,
      });
      // N-07: skipped (not_configured etc.) is ok for retry loops but not failure.
      if (line.status === "failed") {
        channelOk = false;
        lastError = line.error ?? "line_delivery_failed";
      }
    }

    if (shouldAttemptPush || shouldCreateInApp) {
      const push = await deliverWebPushWithAck({
        record,
        autoRecovered: input.autoRecovered,
        jobName: input.jobName ?? null,
      });
      if (push.status === "failed") {
        channelOk = false;
        lastError = push.error ?? lastError ?? "push_delivery_failed";
        await updateDurableDeliveryState({
          notificationId: record.notificationId,
          ownerId: input.userId,
          status: "retry_scheduled",
          pushFailedAt: new Date().toISOString(),
          pushFailureReason: lastError,
        }).catch(() => undefined);
      } else if (push.status === "delivered") {
        await updateDurableDeliveryState({
          notificationId: record.notificationId,
          ownerId: input.userId,
          status: "delivered",
          pushSentAt: new Date().toISOString(),
        }).catch(() => undefined);
      } else {
        // skipped: no subscription / prefs — never mark delivered or pushSentAt
        await updateDurableDeliveryState({
          notificationId: record.notificationId,
          ownerId: input.userId,
          status: "suppressed",
        }).catch(() => undefined);
      }
    }

    if (!channelOk && lastError) {
      await scheduleDurableDeliveryRetry({
        notificationId: record.notificationId,
        ownerId: input.userId,
        errorMessage: lastError,
      }).catch(() => undefined);
    }
  }

  // In-app disabled + LINE-only: durable row exists; do not expose as inbox item.
  if (!shouldCreateInApp) return null;
  return record;
}

/** @deprecated Prefer createUserNotification — kept as async alias (P0-4). */
export async function createNotification(
  input: CreateNotificationInput,
  options?: { skipDelivery?: boolean; eventVersion?: string },
): Promise<NotificationRecord | null> {
  return createUserNotification(input, options);
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
  const record = await createUserNotification(input, { skipDelivery: true });
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
    // True only when a message was actually sent (not skipped soft-ACK).
    lineOk = line.status === "delivered";
  }
  const push = await deliverWebPushWithAck({
    record,
    autoRecovered: input.autoRecovered,
    jobName: input.jobName ?? null,
  });
  pushOk = push.status === "delivered";
  return { record, lineOk, pushOk };
}

export async function listUserNotifications(
  userId: string,
): Promise<NotificationRecord[]> {
  if (!userId.trim()) return [];
  if (isNotificationDurableRequired()) {
    const rows = await listDurableNotifications({
      ownerId: userId,
      inboxOnly: true,
    });
    // Keep process cache warm for legacy readers.
    for (const row of rows) {
      if (!findNotification(row.notificationId)) appendNotification(row);
    }
    return rows;
  }
  return listStoredNotifications({ audience: "user", userId });
}

export function listOwnerNotifications(): NotificationRecord[] {
  return listStoredNotifications({ audience: "owner" });
}

export async function countUnreadUserNotifications(
  userId: string,
): Promise<number> {
  if (!userId.trim()) return 0;
  if (isNotificationDurableRequired()) {
    return countDurableUnread(userId);
  }
  return (await listUserNotifications(userId)).filter((n) => !n.isRead).length;
}

export async function markNotificationRead(
  notificationId: string,
  userId: string,
): Promise<NotificationRecord | null> {
  if (!userId.trim()) return null;
  if (isNotificationDurableRequired()) {
    const updated = await markDurableNotificationRead({
      notificationId,
      ownerId: userId,
    });
    if (updated) {
      updateNotification(notificationId, {
        isRead: true,
        readAt: updated.readAt ?? new Date().toISOString(),
      });
    }
    return updated;
  }
  const record = findNotification(notificationId);
  if (!record || record.userId !== userId) return null;
  const updated = updateNotification(notificationId, {
    isRead: true,
    readAt: new Date().toISOString(),
  });
  schedulePersistNotifications(userId);
  return updated;
}

export async function markAllUserNotificationsRead(
  userId: string,
): Promise<number> {
  if (!userId.trim()) return 0;
  if (isNotificationDurableRequired()) {
    return markAllDurableNotificationsRead({ ownerId: userId });
  }
  let count = 0;
  for (const record of await listUserNotifications(userId)) {
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

export async function removeUserNotification(
  notificationId: string,
  userId: string,
): Promise<boolean> {
  if (!userId.trim()) return false;
  if (isNotificationDurableRequired()) {
    const removed = await softDeleteDurableNotification({
      notificationId,
      ownerId: userId,
    });
    if (removed) deleteNotification(notificationId);
    return removed;
  }
  const record = findNotification(notificationId);
  if (!record || record.userId !== userId) return false;
  const removed = deleteNotification(notificationId);
  if (removed) schedulePersistNotifications(userId);
  return removed;
}

export async function getUserNotificationById(
  notificationId: string,
  userId: string,
): Promise<NotificationRecord | null> {
  if (!userId.trim()) return null;
  if (isNotificationDurableRequired()) {
    return getDurableNotification({ notificationId, ownerId: userId });
  }
  const record = findNotification(notificationId);
  if (!record || record.userId !== userId) return null;
  return record;
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
