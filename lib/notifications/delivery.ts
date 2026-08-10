import "server-only";

import { dispatchLineNotification } from "@/lib/integrations/line/service";
import { dispatchWebPushNotification } from "@/lib/push/dispatch";
import { recordReliabilityEvent, withRetry } from "@/lib/reliability";

import {
  ackDelivered,
  ackFailed,
  ackSkipped,
  LINE_SKIP_REASONS,
  type ChannelAckResult,
} from "./channel-ack";
import { enqueueNotificationDlq } from "./dlq";
import type { LineNotifyEvent, NotificationRecord } from "./types";

const MAX_NOTIFY_ATTEMPTS = 3;

export type { ChannelAckResult };

/**
 * Send LINE with ACK (awaited), retry, then DLQ.
 * N-07: not_configured / disabled / not_linked → skipped (not success ACK).
 */
export async function deliverLineWithAck(input: {
  notificationId: string;
  userId: string;
  event: LineNotifyEvent;
  title: string;
  message: string;
  actionUrl: string | null;
  /** P1-02 retry drain: skip channel DLQ (drain owns terminal DLQ). */
  skipDlq?: boolean;
}): Promise<ChannelAckResult> {
  let attempts = 0;
  try {
    const result = await withRetry(
      async (attempt) => {
        attempts = attempt;
        if (attempt > 1) {
          recordReliabilityEvent("notification_ack", "retry");
          recordReliabilityEvent("retry", "retry");
        }
        const dispatched = await dispatchLineNotification({
          userId: input.userId,
          event: input.event,
          title: input.title,
          message: input.message,
          actionUrl: input.actionUrl,
        });
        if (!dispatched.sent && dispatched.reason && dispatched.reason !== "sent") {
          if (LINE_SKIP_REASONS.has(dispatched.reason)) {
            return { kind: "skip" as const, reason: dispatched.reason };
          }
          throw new Error(`line_delivery_${dispatched.reason}`);
        }
        if (!dispatched.sent) {
          throw new Error("line_delivery_not_sent");
        }
        return { kind: "sent" as const };
      },
      { maxAttempts: MAX_NOTIFY_ATTEMPTS },
    );

    if (result.kind === "skip") {
      // Intentional non-delivery — stop retries; never count as ACK success/failure.
      return ackSkipped({ attempts, reason: result.reason });
    }

    recordReliabilityEvent("notification_ack", "success");
    return ackDelivered({ attempts, sentCount: 1 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error ?? "unknown");
    recordReliabilityEvent("notification_ack", "failure", 1, {
      errorMessage: message,
    });
    if (!input.skipDlq) {
      await enqueueNotificationDlq({
        notificationId: input.notificationId,
        userId: input.userId,
        channel: "line",
        title: input.title,
        message: input.message,
        attemptCount: attempts || MAX_NOTIFY_ATTEMPTS,
        lastError: message,
        status: "dead",
      });
    }
    return ackFailed({
      attempts: attempts || MAX_NOTIFY_ATTEMPTS,
      error: message,
    });
  }
}

/**
 * Send Web Push with ACK (awaited), retry, then DLQ.
 * N-07: VAPID missing / prefs off / zero subscriptions → skipped (not success).
 */
export async function deliverWebPushWithAck(input: {
  record: NotificationRecord;
  autoRecovered?: boolean;
  jobName?: string | null;
  /** P1-02 retry drain: skip channel DLQ (drain owns terminal DLQ). */
  skipDlq?: boolean;
}): Promise<ChannelAckResult> {
  if (!input.record.userId) {
    return ackFailed({ attempts: 0, error: "missing_user" });
  }
  let attempts = 0;
  try {
    const result = await withRetry(
      async (attempt) => {
        attempts = attempt;
        if (attempt > 1) {
          recordReliabilityEvent("notification_ack", "retry");
          recordReliabilityEvent("retry", "retry");
        }
        const dispatched = await dispatchWebPushNotification({
          userId: input.record.userId!,
          record: input.record,
          eventCategory: input.record.eventCategory ?? null,
          severity: input.record.severity ?? null,
          autoRecovered: input.autoRecovered,
          jobName: input.jobName ?? null,
        });
        if (dispatched.failed > 0 && dispatched.sent === 0) {
          throw new Error(`web_push_failed:${dispatched.failed}`);
        }
        if (dispatched.sent === 0) {
          return {
            kind: "skip" as const,
            reason: "no_subscription_or_disabled",
            sent: 0,
          };
        }
        return { kind: "sent" as const, sent: dispatched.sent };
      },
      { maxAttempts: MAX_NOTIFY_ATTEMPTS },
    );

    if (result.kind === "skip") {
      // No subscription / prefs off — not a delivery success.
      return ackSkipped({ attempts, reason: result.reason });
    }

    recordReliabilityEvent("notification_ack", "success");
    return ackDelivered({ attempts, sentCount: result.sent });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error ?? "unknown");
    recordReliabilityEvent("notification_ack", "failure", 1, {
      errorMessage: message,
    });
    if (!input.skipDlq) {
      await enqueueNotificationDlq({
        notificationId: input.record.notificationId,
        userId: input.record.userId!,
        channel: "web_push",
        title: input.record.title,
        message: input.record.message,
        attemptCount: attempts || MAX_NOTIFY_ATTEMPTS,
        lastError: message,
        status: "dead",
      });
    }
    return ackFailed({
      attempts: attempts || MAX_NOTIFY_ATTEMPTS,
      error: message,
    });
  }
}
