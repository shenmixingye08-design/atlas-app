import "server-only";

import webpush from "web-push";

import { getStoredPreferences } from "@/lib/notifications/store";
import type { NotificationRecord } from "@/lib/notifications/types";
import { updateNotification } from "@/lib/notifications/store";
import { schedulePersistNotifications } from "@/lib/notifications/durable";

import { isSpamCategory, resolvePushEventCategory, resolvePushSeverity } from "./categories";
import { buildPushCopy } from "./templates";
import {
  listActivePushSubscriptions,
  recordPushFailure,
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
} from "./vapid";

let vapidConfigured = false;

function ensureVapidConfigured(): boolean {
  if (vapidConfigured) return true;
  if (!isWebPushConfigured()) return false;
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

function isInQuietHours(prefs: PushPreferences, now = new Date()): boolean {
  if (!prefs.quietHoursStart || !prefs.quietHoursEnd) return false;

  const [startH, startM] = prefs.quietHoursStart.split(":").map(Number);
  const [endH, endM] = prefs.quietHoursEnd.split(":").map(Number);
  if ([startH, startM, endH, endM].some((n) => Number.isNaN(n))) return false;

  const minutes = now.getHours() * 60 + now.getMinutes();
  const start = startH * 60 + startM;
  const end = endH * 60 + endM;

  if (start <= end) {
    return minutes >= start && minutes < end;
  }
  return minutes >= start || minutes < end;
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
  if (isInQuietHours(pushPrefs)) return false;

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

export async function dispatchWebPushNotification(input: {
  userId: string;
  record: NotificationRecord;
  eventCategory?: PushEventCategory | null;
  severity?: PushSeverity | null;
  autoRecovered?: boolean;
  jobName?: string | null;
  /** When set, job-level push dedupe uses atlas_automation_jobs.push_status. */
  jobId?: string | null;
}): Promise<{ sent: number; failed: number }> {
  if (!ensureVapidConfigured()) {
    return { sent: 0, failed: 0 };
  }

  if (input.jobId) {
    const { getJobRecord, setJobPushStatus } = await import("@/lib/jobs/reliability");
    const job = await getJobRecord(input.jobId, input.userId);
    if (job?.pushStatus === "sent" || job?.pushStatus === "skipped") {
      return { sent: 0, failed: 0 };
    }
  }

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
    return { sent: 0, failed: 0 };
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
    input.record.actionUrl ?? `/results/${encodeURIComponent(input.record.notificationId)}`,
  );

  if (!isSameOriginTarget(targetUrl)) {
    console.warn("[push] blocked non-same-origin target URL");
    return { sent: 0, failed: 0 };
  }

  const payload: PushPayload = {
    notificationId: input.record.notificationId,
    title: copy.title,
    body: copy.body,
    targetUrl,
    severity,
    eventCategory,
  };

  const subscriptions = await listActivePushSubscriptions(input.userId);
  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;
  const now = new Date().toISOString();

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.authKey },
        },
        JSON.stringify(payload),
        { TTL: 86400, urgency: severity === "critical" ? "high" : "normal" },
      );
      sent += 1;
    } catch (error) {
      failed += 1;
      const statusCode =
        error && typeof error === "object" && "statusCode" in error
          ? (error as { statusCode?: number }).statusCode
          : undefined;
      const reason =
        error instanceof Error ? error.message : "Web Push delivery failed";

      await recordPushFailure({
        userId: input.userId,
        endpoint: sub.endpoint,
        reason,
      });

      if (statusCode === 404 || statusCode === 410) {
        await import("./subscription-store").then(({ deactivatePushSubscription }) =>
          deactivatePushSubscription({ userId: input.userId, endpoint: sub.endpoint }),
        );
      }
    }
  }

  updateNotification(input.record.notificationId, {
    pushSentAt: sent > 0 ? now : input.record.pushSentAt ?? null,
    pushFailedAt: failed > 0 && sent === 0 ? now : input.record.pushFailedAt ?? null,
    pushFailureReason:
      failed > 0 && sent === 0 ? "push_delivery_failed" : input.record.pushFailureReason ?? null,
    severity,
    eventCategory,
  });
  schedulePersistNotifications(input.userId);

  if (input.jobId && sent > 0) {
    const { setJobPushStatus } = await import("@/lib/jobs/reliability");
    await setJobPushStatus(input.jobId, input.userId, "sent").catch(() => undefined);
  }

  return { sent, failed };
}

export async function sendTestPush(userId: string): Promise<{ sent: number; failed: number }> {
  if (!ensureVapidConfigured()) {
    throw new Error("Web Push is not configured");
  }

  const subscriptions = await listActivePushSubscriptions(userId);
  if (subscriptions.length === 0) {
    throw new Error("No active push subscriptions");
  }

  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "";

  const payload: PushPayload = {
    notificationId: "test",
    title: "MINERVOT テスト通知",
    body: "スマホ通知が正常に届いています。",
    targetUrl: `${origin}/settings/notifications`,
    severity: "summary",
    eventCategory: "daily_report",
  };

  let sent = 0;
  let failed = 0;

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.authKey },
        },
        JSON.stringify(payload),
      );
      sent += 1;
    } catch (error) {
      failed += 1;
      await recordPushFailure({
        userId,
        endpoint: sub.endpoint,
        reason: error instanceof Error ? error.message : "test push failed",
      });
    }
  }

  return { sent, failed };
}
