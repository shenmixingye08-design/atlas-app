import "server-only";

import webpush from "web-push";

import { getStoredPreferences } from "@/lib/notifications/store";
import type { NotificationRecord } from "@/lib/notifications/types";
import { updateNotification } from "@/lib/notifications/store";
import { schedulePersistNotifications } from "@/lib/notifications/durable";

import { isSpamCategory, resolvePushEventCategory, resolvePushSeverity } from "./categories";
import { buildPushCopy } from "./templates";
import { isSuppressedByQuietHours } from "./quiet-hours";
import { sanitizePushText } from "./sanitize";
import {
  listActivePushSubscriptions,
  pruneInvalidPushSubscription,
  recordPushFailure,
  touchPushSubscription,
} from "./subscription-store";
import type { PushEventCategory, PushPayload, PushPreferences, PushSeverity } from "./types";
import {
  DEFAULT_PUSH_PREFERENCES,
  DEFAULT_PUSH_SEVERITIES,
} from "./types";
import {
  getVapidPrivateKey,
  getVapidPublicKey,
  getVapidSubject,
  isWebPushConfigured,
  logVapidConfigIssues,
} from "./vapid";

let vapidConfigured = false;

/** In-process dedupe: skip only after a successful send for the same notificationId. */
const recentSuccessIds = new Map<string, number>();
const inFlightIds = new Set<string>();
const DEDUPE_TTL_MS = 60_000;

function beginDispatch(notificationId: string): boolean {
  const now = Date.now();
  for (const [id, at] of recentSuccessIds) {
    if (now - at > DEDUPE_TTL_MS) recentSuccessIds.delete(id);
  }
  if (recentSuccessIds.has(notificationId)) return false;
  if (inFlightIds.has(notificationId)) return false;
  inFlightIds.add(notificationId);
  return true;
}

function endDispatch(notificationId: string, sent: number): void {
  inFlightIds.delete(notificationId);
  if (sent > 0) {
    recentSuccessIds.set(notificationId, Date.now());
  }
}

function ensureVapidConfigured(): boolean {
  if (vapidConfigured) return true;
  if (!isWebPushConfigured()) {
    logVapidConfigIssues("dispatch");
    return false;
  }
  webpush.setVapidDetails(
    getVapidSubject(),
    getVapidPublicKey()!,
    getVapidPrivateKey(),
  );
  vapidConfigured = true;
  return true;
}

function resolvePushPreferences(userId: string): PushPreferences {
  const prefs = getStoredPreferences(userId);
  const pushPrefs = (prefs as { push?: Partial<PushPreferences> }).push;
  return {
    events: { ...DEFAULT_PUSH_PREFERENCES.events, ...pushPrefs?.events },
    severities: {
      ...DEFAULT_PUSH_SEVERITIES,
      ...pushPrefs?.severities,
    },
    quietHoursStart: pushPrefs?.quietHoursStart ?? null,
    quietHoursEnd: pushPrefs?.quietHoursEnd ?? null,
  };
}

function shouldSendPush(input: {
  userId: string;
  eventCategory: PushEventCategory;
  severity: PushSeverity;
}): boolean {
  const prefs = getStoredPreferences(input.userId);
  if (!prefs.allEnabled || !prefs.channels.push) return false;
  if (isSpamCategory(input.eventCategory)) return false;

  const pushPrefs = resolvePushPreferences(input.userId);
  if (!pushPrefs.events[input.eventCategory]) return false;
  if (!pushPrefs.severities[input.severity]) return false;
  if (
    isSuppressedByQuietHours({
      prefs: pushPrefs,
      severity: input.severity,
    })
  ) {
    return false;
  }

  return true;
}

function resolveAbsoluteUrl(relativeUrl: string | null): string {
  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "";
  if (!relativeUrl) return origin || "/";
  if (relativeUrl.startsWith("http://") || relativeUrl.startsWith("https://")) {
    return relativeUrl;
  }
  return `${origin}${relativeUrl.startsWith("/") ? "" : "/"}${relativeUrl}`;
}

function isSameOriginTarget(url: string): boolean {
  try {
    const origin =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
      "";
    if (!origin) return url.startsWith("/");
    const target = new URL(url, origin);
    const base = new URL(origin);
    return target.origin === base.origin;
  } catch {
    return false;
  }
}

function statusCodeFromError(error: unknown): number | undefined {
  if (error && typeof error === "object" && "statusCode" in error) {
    return (error as { statusCode?: number }).statusCode;
  }
  return undefined;
}

async function deliverToSubscriptions(input: {
  userId: string;
  payload: PushPayload;
  urgency?: "high" | "normal";
}): Promise<{ sent: number; failed: number; invalid: number }> {
  const subscriptions = await listActivePushSubscriptions(input.userId);
  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0, invalid: 0 };
  }

  let sent = 0;
  let failed = 0;
  let invalid = 0;

  const body = JSON.stringify({
    ...input.payload,
    title: sanitizePushText(input.payload.title, 80),
    body: sanitizePushText(input.payload.body, 180),
  });

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.authKey },
        },
        body,
        {
          TTL: 86400,
          urgency: input.urgency ?? "normal",
        },
      );
      sent += 1;
      await touchPushSubscription({
        userId: input.userId,
        endpoint: sub.endpoint,
      });
    } catch (error) {
      failed += 1;
      const statusCode = statusCodeFromError(error);
      const reason =
        error instanceof Error ? error.message : "Web Push delivery failed";

      await recordPushFailure({
        userId: input.userId,
        endpoint: sub.endpoint,
        reason: reason.slice(0, 200),
      });

      if (statusCode === 404 || statusCode === 410) {
        invalid += 1;
        await pruneInvalidPushSubscription({
          userId: input.userId,
          endpoint: sub.endpoint,
          hardDelete: false,
        });
      }
    }
  }

  return { sent, failed, invalid };
}

export async function dispatchWebPushNotification(input: {
  userId: string;
  record: NotificationRecord;
  eventCategory?: PushEventCategory | null;
  severity?: PushSeverity | null;
  autoRecovered?: boolean;
  jobName?: string | null;
}): Promise<{ sent: number; failed: number; invalid: number }> {
  if (!ensureVapidConfigured()) {
    return { sent: 0, failed: 0, invalid: 0 };
  }

  if (!beginDispatch(input.record.notificationId)) {
    return { sent: 0, failed: 0, invalid: 0 };
  }

  let sentForDedupe = 0;
  try {
    const eventCategory =
      input.eventCategory ??
      resolvePushEventCategory({
        type: input.record.type,
        eventCategory: input.record.eventCategory ?? null,
        autoRecovered: input.autoRecovered,
      });

    const severity =
      input.severity ??
      resolvePushSeverity({
        type: input.record.type,
        severity: input.record.severity ?? null,
        eventCategory,
      });

    if (!shouldSendPush({ userId: input.userId, eventCategory, severity })) {
      return { sent: 0, failed: 0, invalid: 0 };
    }

    const copy = buildPushCopy({
      type: input.record.type,
      title: input.record.title,
      message: input.record.message,
      eventCategory,
      jobName: input.jobName,
      autoRecovered: input.autoRecovered,
    });

    const targetUrl = resolveAbsoluteUrl(
      input.record.actionUrl ??
        `/results/${encodeURIComponent(input.record.notificationId)}`,
    );

    if (!isSameOriginTarget(targetUrl)) {
      console.warn("[push] blocked non-same-origin target URL");
      return { sent: 0, failed: 0, invalid: 0 };
    }

    const payload: PushPayload = {
      notificationId: input.record.notificationId,
      title: copy.title,
      body: copy.body,
      targetUrl,
      severity,
      eventCategory,
    };

    const result = await deliverToSubscriptions({
      userId: input.userId,
      payload,
      urgency: severity === "critical" ? "high" : "normal",
    });
    sentForDedupe = result.sent;

    const now = new Date().toISOString();
    updateNotification(input.record.notificationId, {
      pushSentAt: result.sent > 0 ? now : (input.record.pushSentAt ?? null),
      pushFailedAt:
        result.failed > 0 && result.sent === 0
          ? now
          : (input.record.pushFailedAt ?? null),
      pushFailureReason:
        result.failed > 0 && result.sent === 0
          ? "push_delivery_failed"
          : (input.record.pushFailureReason ?? null),
      severity,
      eventCategory,
    });
    schedulePersistNotifications(input.userId);

    return result;
  } finally {
    endDispatch(input.record.notificationId, sentForDedupe);
  }
}

export async function sendTestPush(
  userId: string,
): Promise<{ sent: number; failed: number; invalid: number }> {
  if (!ensureVapidConfigured()) {
    throw new Error("web_push_not_configured");
  }

  const subscriptions = await listActivePushSubscriptions(userId);
  if (subscriptions.length === 0) {
    throw new Error("no_active_subscription");
  }

  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "";

  const payload: PushPayload = {
    notificationId: `test-${Date.now()}`,
    title: "MINERVOT",
    body: "スマホ通知の設定が完了しました。",
    targetUrl: `${origin}/notifications`,
    severity: "summary",
    eventCategory: "daily_report",
  };

  return deliverToSubscriptions({
    userId,
    payload,
    urgency: "normal",
  });
}
