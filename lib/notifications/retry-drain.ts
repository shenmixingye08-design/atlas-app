/**
 * P1-02: Drain durable notification delivery retries from automation tick.
 * Uses existing atlas_user_notifications retry fields + DLQ + P1-04 side-effect claims.
 * DLQ rows (dead) are never re-injected into the normal retry loop.
 */

import "server-only";

import { randomUUID } from "node:crypto";

import { executeIdempotentSideEffect } from "@/lib/side-effects/execute";
import { SideEffectFailClosedError } from "@/lib/side-effects/types";

import {
  deliverLineWithAck,
  deliverWebPushWithAck,
} from "./delivery";
import { enqueueNotificationDlq } from "./dlq";
import {
  claimDueDeliveryRetry,
  listDueDeliveryRetries,
  rowToRecord,
  scheduleDurableDeliveryRetry,
  updateDurableDeliveryState,
  type DurableInboxRow,
} from "./durable-inbox";
import type { LineNotifyEvent } from "./types";

export type NotificationRetryDrainResult = {
  due: number;
  claimed: number;
  delivered: number;
  rescheduled: number;
  deadLettered: number;
  skipped: number;
  failed: number;
  /** Always 0 — DLQ is terminal and not auto-replayed into normal processing. */
  dlqReinjected: number;
};

const DEFAULT_LIMIT = 20;

const LINE_EVENTS: ReadonlySet<string> = new Set([
  "work_completed",
  "mail_received",
  "document_ready",
  "automation_completed",
  "confirmation_request",
  "error",
  "todays_schedule",
  "morning_briefing",
]);

function isLineEvent(value: string | null): value is LineNotifyEvent {
  return Boolean(value && LINE_EVENTS.has(value));
}

async function redeliverChannels(row: DurableInboxRow): Promise<{
  ok: boolean;
  error: string | null;
  lineAttempted: boolean;
  pushAttempted: boolean;
}> {
  const record = rowToRecord(row);
  let ok = true;
  let error: string | null = null;
  let lineAttempted = false;
  let pushAttempted = false;

  const lineEvent = isLineEvent(row.lineEvent) ? row.lineEvent : null;
  if (lineEvent && row.ownerId) {
    lineAttempted = true;
    try {
      await executeIdempotentSideEffect(
        {
          userId: row.ownerId,
          provider: "notification",
          actionType: "notify",
          destination: "line",
          automationId: row.automationId,
          runId: row.requestId ?? row.notificationId,
          occurrenceKey: row.idempotencyKey,
          discriminator: `${row.notificationId}:line:r${row.retryCount}`,
        },
        async () => {
          const result = await deliverLineWithAck({
            notificationId: row.notificationId,
            userId: row.ownerId,
            event: lineEvent,
            title: row.title,
            message: row.body,
            actionUrl: row.actionUrl,
            skipDlq: true,
          });
          if (!result.ok) {
            throw new Error(result.error ?? "line_delivery_failed");
          }
          return {
            providerResourceId: `${row.notificationId}:line:r${row.retryCount}`,
            result: { ok: true as const, attempts: result.attempts },
            evidence: { channel: "line", retryCount: row.retryCount },
          };
        },
      );
    } catch (err) {
      if (err instanceof SideEffectFailClosedError) {
        // Ambiguous prior outcome — do not resend; treat as non-success for status.
        ok = false;
        error = err.message;
      } else {
        ok = false;
        error = err instanceof Error ? err.message : "line_delivery_failed";
      }
    }
  }

  // Push path for in-app / push channel notifications.
  if (row.channel === "in_app" || row.channel === "push") {
    pushAttempted = true;
    try {
      await executeIdempotentSideEffect(
        {
          userId: row.ownerId,
          provider: "notification",
          actionType: "notify",
          destination: "web_push",
          automationId: row.automationId,
          runId: row.requestId ?? row.notificationId,
          occurrenceKey: row.idempotencyKey,
          discriminator: `${row.notificationId}:web_push:r${row.retryCount}`,
        },
        async () => {
          const result = await deliverWebPushWithAck({
            record,
            skipDlq: true,
          });
          if (!result.ok) {
            throw new Error(result.error ?? "web_push_failed");
          }
          return {
            providerResourceId: `${row.notificationId}:web_push:r${row.retryCount}`,
            result: { ok: true as const, attempts: result.attempts },
            evidence: { channel: "web_push", retryCount: row.retryCount },
          };
        },
      );
    } catch (err) {
      if (err instanceof SideEffectFailClosedError) {
        ok = false;
        error = err.message;
      } else {
        ok = false;
        error = err instanceof Error ? err.message : "web_push_failed";
      }
    }
  }

  // Nothing to deliver (prefs/channels off) → treat as delivered to stop retry loops.
  if (!lineAttempted && !pushAttempted) {
    return { ok: true, error: null, lineAttempted, pushAttempted };
  }

  return { ok, error, lineAttempted, pushAttempted };
}

async function deadLetter(row: DurableInboxRow, lastError: string): Promise<void> {
  await updateDurableDeliveryState({
    notificationId: row.notificationId,
    ownerId: row.ownerId,
    status: "failed",
    pushFailedAt: new Date().toISOString(),
    pushFailureReason: lastError.slice(0, 500),
    nextRetryAt: null,
    retryCount: row.retryCount,
  });

  // Terminal DLQ — status dead. Never auto-replayed into normal retry.
  if (row.lineEvent) {
    await enqueueNotificationDlq({
      notificationId: row.notificationId,
      userId: row.ownerId,
      channel: "line",
      title: row.title,
      message: row.body,
      attemptCount: row.retryCount,
      lastError,
      status: "dead",
    });
  }
  if (row.channel === "in_app" || row.channel === "push") {
    await enqueueNotificationDlq({
      notificationId: row.notificationId,
      userId: row.ownerId,
      channel: "web_push",
      title: row.title,
      message: row.body,
      attemptCount: row.retryCount,
      lastError,
      status: "dead",
    });
  }
}

/**
 * Process due `retry_scheduled` notification deliveries.
 * Safe for multi-instance tick (claim via next_retry_at lease + P1-04 channel claims).
 */
export async function processDurableNotificationRetries(options?: {
  limit?: number;
  nowMs?: number;
  leaseOwner?: string;
  /**
   * Production/unit smoke only: force channel delivery failure for one owner
   * so max-retry → DLQ can be proven when LINE/push are not_configured
   * (those reasons are treated as soft-success by deliver*WithAck).
   */
  forceDeliveryFailureForOwner?: string;
}): Promise<NotificationRetryDrainResult> {
  const result: NotificationRetryDrainResult = {
    due: 0,
    claimed: 0,
    delivered: 0,
    rescheduled: 0,
    deadLettered: 0,
    skipped: 0,
    failed: 0,
    dlqReinjected: 0,
  };

  const due = await listDueDeliveryRetries({
    limit: options?.limit ?? DEFAULT_LIMIT,
    nowMs: options?.nowMs,
  });
  result.due = due.length;
  const leaseOwner = options?.leaseOwner ?? `notify_tick_${randomUUID().slice(0, 8)}`;

  for (const row of due) {
    if (!row.ownerId?.trim()) {
      result.skipped += 1;
      continue;
    }

    const claimed = await claimDueDeliveryRetry({
      notificationId: row.notificationId,
      ownerId: row.ownerId,
      leaseOwner,
      nowMs: options?.nowMs,
    });
    if (!claimed || claimed.ownerId !== row.ownerId) {
      result.skipped += 1;
      continue;
    }
    result.claimed += 1;

    try {
      const delivery =
        options?.forceDeliveryFailureForOwner &&
        claimed.ownerId === options.forceDeliveryFailureForOwner
          ? {
              ok: false as const,
              error: "p102_smoke_force_delivery_failure",
              lineAttempted: true,
              pushAttempted: true,
            }
          : await redeliverChannels(claimed);
      if (delivery.ok) {
        await updateDurableDeliveryState({
          notificationId: claimed.notificationId,
          ownerId: claimed.ownerId,
          status: "delivered",
          pushSentAt: new Date().toISOString(),
          nextRetryAt: null,
          retryCount: claimed.retryCount,
        });
        result.delivered += 1;
        continue;
      }

      const errorMessage = delivery.error ?? "notification_retry_failed";
      const willExceed = claimed.retryCount >= claimed.maxRetries;
      if (willExceed) {
        await deadLetter(claimed, errorMessage);
        result.deadLettered += 1;
      } else {
        await scheduleDurableDeliveryRetry({
          notificationId: claimed.notificationId,
          ownerId: claimed.ownerId,
          errorMessage,
        });
        result.rescheduled += 1;
      }
    } catch (error) {
      result.failed += 1;
      const message =
        error instanceof Error ? error.message.slice(0, 200) : "retry_drain_error";
      try {
        if (claimed.retryCount >= claimed.maxRetries) {
          await deadLetter(claimed, message);
          result.deadLettered += 1;
        } else {
          await scheduleDurableDeliveryRetry({
            notificationId: claimed.notificationId,
            ownerId: claimed.ownerId,
            errorMessage: message,
          });
          result.rescheduled += 1;
        }
      } catch {
        // leave claimed lease; next tick may reclaim after lease expiry
      }
    }
  }

  return result;
}
