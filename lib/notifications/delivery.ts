import "server-only";

import { dispatchLineNotification } from "@/lib/integrations/line/service";
import { dispatchWebPushNotification } from "@/lib/push/dispatch";
import { recordReliabilityEvent, withRetry } from "@/lib/reliability";

import { enqueueNotificationDlq } from "./dlq";
import type { LineNotifyEvent, NotificationRecord } from "./types";

const MAX_NOTIFY_ATTEMPTS = 3;

/**
 * Send LINE with ACK (awaited), retry, then DLQ. No fire-and-forget success.
 */
export async function deliverLineWithAck(input: {
  notificationId: string;
  userId: string;
  event: LineNotifyEvent;
  title: string;
  message: string;
  actionUrl: string | null;
}): Promise<{ ok: boolean; attempts: number; error?: string }> {
  let attempts = 0;
  try {
    await withRetry(
      async (attempt) => {
        attempts = attempt;
        if (attempt > 1) {
          recordReliabilityEvent("notification_ack", "retry");
          recordReliabilityEvent("retry", "retry");
        }
        const result = await dispatchLineNotification({
          userId: input.userId,
          event: input.event,
          title: input.title,
          message: input.message,
          actionUrl: input.actionUrl,
        });
        // Not configured / disabled is not a delivery failure for quality gates.
        if (!result.sent && result.reason && result.reason !== "sent") {
          if (
            result.reason === "disabled" ||
            result.reason === "not_configured" ||
            result.reason === "not_linked" ||
            result.reason === "event_disabled"
          ) {
            return result;
          }
          throw new Error(`line_delivery_${result.reason}`);
        }
        return result;
      },
      { maxAttempts: MAX_NOTIFY_ATTEMPTS },
    );
    recordReliabilityEvent("notification_ack", "success");
    return { ok: true, attempts };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error ?? "unknown");
    recordReliabilityEvent("notification_ack", "failure", 1, {
      errorMessage: message,
    });
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
    return { ok: false, attempts: attempts || MAX_NOTIFY_ATTEMPTS, error: message };
  }
}

/**
 * Send Web Push with ACK (awaited), retry, then DLQ.
 */
export async function deliverWebPushWithAck(input: {
  record: NotificationRecord;
  autoRecovered?: boolean;
  jobName?: string | null;
}): Promise<{ ok: boolean; attempts: number; error?: string }> {
  if (!input.record.userId) {
    return { ok: false, attempts: 0, error: "missing_user" };
  }
  let attempts = 0;
  try {
    await withRetry(
      async (attempt) => {
        attempts = attempt;
        if (attempt > 1) {
          recordReliabilityEvent("notification_ack", "retry");
          recordReliabilityEvent("retry", "retry");
        }
        const result = await dispatchWebPushNotification({
          userId: input.record.userId!,
          record: input.record,
          eventCategory: input.record.eventCategory ?? null,
          severity: input.record.severity ?? null,
          autoRecovered: input.autoRecovered,
          jobName: input.jobName ?? null,
        });
        if (result.failed > 0 && result.sent === 0) {
          throw new Error(`web_push_failed:${result.failed}`);
        }
        return result;
      },
      { maxAttempts: MAX_NOTIFY_ATTEMPTS },
    );
    recordReliabilityEvent("notification_ack", "success");
    return { ok: true, attempts };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error ?? "unknown");
    recordReliabilityEvent("notification_ack", "failure", 1, {
      errorMessage: message,
    });
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
    return { ok: false, attempts: attempts || MAX_NOTIFY_ATTEMPTS, error: message };
  }
}
