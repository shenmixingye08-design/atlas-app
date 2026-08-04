import "server-only";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

export type NotificationDlqChannel = "line" | "web_push";

export type NotificationDlqRecord = {
  id: string;
  notificationId: string;
  userId: string;
  channel: NotificationDlqChannel;
  title: string;
  message: string;
  attemptCount: number;
  lastError: string | null;
  status: "pending_retry" | "dead" | "resolved";
  createdAt: string;
  updatedAt: string;
};

type MemoryDlq = NotificationDlqRecord[];

function getMemoryDlq(): MemoryDlq {
  const g = globalThis as typeof globalThis & {
    __atlasNotificationDlq?: MemoryDlq;
  };
  if (!g.__atlasNotificationDlq) g.__atlasNotificationDlq = [];
  return g.__atlasNotificationDlq;
}

export async function enqueueNotificationDlq(input: {
  notificationId: string;
  userId: string;
  channel: NotificationDlqChannel;
  title: string;
  message: string;
  attemptCount: number;
  lastError: string;
  payload?: Record<string, unknown>;
  status?: "pending_retry" | "dead";
}): Promise<NotificationDlqRecord> {
  const now = new Date().toISOString();
  const record: NotificationDlqRecord = {
    id: crypto.randomUUID(),
    notificationId: input.notificationId,
    userId: input.userId,
    channel: input.channel,
    title: input.title,
    message: input.message,
    attemptCount: input.attemptCount,
    lastError: input.lastError,
    status: input.status ?? "dead",
    createdAt: now,
    updatedAt: now,
  };

  getMemoryDlq().unshift(record);
  if (getMemoryDlq().length > 500) getMemoryDlq().length = 500;

  try {
    const client = createServiceRoleClientIfConfigured();
    if (client) {
      const { error } = await client.from("atlas_notification_dlq").insert({
        id: record.id,
        notification_id: record.notificationId,
        user_id: record.userId,
        channel: record.channel,
        title: record.title,
        message: record.message,
        attempt_count: record.attemptCount,
        last_error: record.lastError,
        payload: input.payload ?? {},
        status: record.status,
        created_at: record.createdAt,
        updated_at: record.updatedAt,
      } as never);
      if (error) {
        console.warn("[atlas_notification_dlq] insert failed", error.message);
      }
    }
  } catch (error) {
    console.warn("[atlas_notification_dlq] insert error", error);
  }

  return record;
}

export async function listNotificationDlq(limit = 100): Promise<NotificationDlqRecord[]> {
  try {
    const client = createServiceRoleClientIfConfigured();
    if (client) {
      const { data, error } = await client
        .from("atlas_notification_dlq")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (!error && data) {
        return (data as Array<Record<string, unknown>>).map((row) => ({
          id: String(row.id),
          notificationId: String(row.notification_id),
          userId: String(row.user_id),
          channel: row.channel as NotificationDlqChannel,
          title: String(row.title),
          message: String(row.message),
          attemptCount: Number(row.attempt_count ?? 0),
          lastError: (row.last_error as string | null) ?? null,
          status: row.status as NotificationDlqRecord["status"],
          createdAt: String(row.created_at),
          updatedAt: String(row.updated_at),
        }));
      }
    }
  } catch (error) {
    console.warn("[atlas_notification_dlq] list error", error);
  }
  return getMemoryDlq().slice(0, limit);
}
