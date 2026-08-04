import "server-only";

import {
  notifyBillingGraceScheduled,
  notifyBillingPaymentFailed,
  notifyBillingPlanChanged,
  notifyBillingPlanDowngraded,
  notifyOwnerPaymentFailed as emitOwnerPaymentFailed,
} from "@/lib/notifications/emitters";
import {
  listOwnerNotifications,
  listUserNotifications,
} from "@/lib/notifications/service";
import type { NotificationRecord } from "@/lib/notifications/types";

import type {
  BillingNotificationAudience,
  BillingNotificationKind,
  BillingNotificationRecord,
} from "./types";

function inferBillingKind(record: NotificationRecord): BillingNotificationKind {
  if (record.title.includes("お支払いに失敗")) return "payment_failed";
  if (record.title.includes("お支払いが完了")) return "payment_succeeded";
  if (record.title.includes("Freeプラン")) return "plan_downgraded";
  if (record.title.includes("自動停止予定")) return "payment_grace_scheduled";
  return "plan_changed";
}

function toBillingRecord(record: NotificationRecord): BillingNotificationRecord {
  return {
    id: record.notificationId,
    audience: record.audience as BillingNotificationAudience,
    userId: record.userId,
    kind: inferBillingKind(record),
    title: record.title,
    message: record.message,
    createdAt: record.createdAt,
    readAt: record.isRead ? record.createdAt : null,
  };
}

function requireBillingRecord(
  record: NotificationRecord | null,
  fallbackTitle: string,
): BillingNotificationRecord {
  if (record) return toBillingRecord(record);
  return {
    id: `bn_skipped_${Date.now()}`,
    audience: "user",
    userId: null,
    kind: "plan_changed",
    title: fallbackTitle,
    message: "通知設定によりスキップされました。",
    createdAt: new Date().toISOString(),
    readAt: null,
  };
}

export async function notifyUserPaymentFailed(
  userId: string,
): Promise<BillingNotificationRecord> {
  return requireBillingRecord(
    await notifyBillingPaymentFailed(userId),
    "お支払いに失敗しました",
  );
}

export async function notifyOwnerPaymentFailed(
  userId: string,
): Promise<BillingNotificationRecord> {
  const record = await emitOwnerPaymentFailed(userId);
  return record
    ? toBillingRecord(record)
    : {
        id: `bn_owner_${Date.now()}`,
        audience: "owner",
        userId,
        kind: "payment_failed",
        title: "Stripe決済失敗",
        message: `ユーザー ${userId} の決済が失敗しました。`,
        createdAt: new Date().toISOString(),
        readAt: null,
      };
}

export async function notifyUserPlanChanged(
  userId: string,
  planLabel: string,
): Promise<BillingNotificationRecord> {
  return requireBillingRecord(
    await notifyBillingPlanChanged(userId, planLabel),
    "プランが更新されました",
  );
}

export async function notifyUserPlanDowngraded(
  userId: string,
): Promise<BillingNotificationRecord> {
  return requireBillingRecord(
    await notifyBillingPlanDowngraded(userId),
    "Freeプランに変更されました",
  );
}

export async function notifyUserPaymentGraceScheduled(
  userId: string,
  graceEndsAt: string,
): Promise<BillingNotificationRecord> {
  return requireBillingRecord(
    await notifyBillingGraceScheduled(userId, graceEndsAt),
    "自動停止予定",
  );
}

export async function listUserBillingNotifications(
  userId: string,
): Promise<BillingNotificationRecord[]> {
  return (await listUserNotifications(userId))
    .filter((record) => record.type === "billing")
    .map(toBillingRecord);
}

export function listOwnerBillingNotifications(): BillingNotificationRecord[] {
  return listOwnerNotifications()
    .filter((record) => record.type === "billing")
    .map(toBillingRecord);
}

export type { BillingNotificationRecord } from "./types";
