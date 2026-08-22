import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

import {
  assertNotificationBackendReady,
  isNotificationDurableRequired,
  resolveNotificationStorageBackend,
} from "./notification-backend";
import {
  classifyNotificationPersistError,
  logAutomationNotificationPersistence,
} from "./persist-log";
import { MAX_NOTIFICATIONS_PER_USER } from "./store";
import type { NotificationRecord, NotificationType } from "./types";

export { MAX_NOTIFICATIONS_PER_USER };
export const NOTIFICATION_RETENTION_DAYS = 90;

export type NotificationDeliveryStatus =
  | "pending"
  | "delivered"
  | "failed"
  | "retry_scheduled"
  | "suppressed"
  | "read";

export type DurableInboxRow = {
  notificationId: string;
  ownerId: string;
  organizationId: string | null;
  audience: "user" | "owner";
  sourceType: string | null;
  sourceId: string | null;
  eventType: NotificationType;
  channel: "in_app" | "email" | "line" | "slack" | "push";
  title: string;
  body: string;
  severity: string | null;
  status: NotificationDeliveryStatus;
  readAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  retryCount: number;
  nextRetryAt: string | null;
  maxRetries: number;
  idempotencyKey: string;
  diagnosticId: string | null;
  metadata: Record<string, unknown>;
  relatedTaskId: string | null;
  relatedService: string | null;
  actionUrl: string | null;
  targetType: string | null;
  targetId: string | null;
  workflowRunId: string | null;
  deliverableId: string | null;
  requestId: string | null;
  automationId: string | null;
  lineEvent: string | null;
  eventCategory: string | null;
  pushSentAt: string | null;
  pushFailedAt: string | null;
  pushFailureReason: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  deletedAt: string | null;
};

export class NotificationInboxUnavailableError extends Error {
  readonly code = "notification_inbox_unavailable";

  constructor(message: string) {
    super(message);
    this.name = "NotificationInboxUnavailableError";
  }
}

type MemoryBucket = Map<string, DurableInboxRow>;

function getMemoryBucket(): MemoryBucket {
  const scope = globalThis as typeof globalThis & {
    __atlasDurableNotificationInbox?: MemoryBucket;
  };
  if (!scope.__atlasDurableNotificationInbox) {
    scope.__atlasDurableNotificationInbox = new Map();
  }
  return scope.__atlasDurableNotificationInbox;
}

export function resetDurableInboxForTests(): void {
  getMemoryBucket().clear();
}

export function buildNotificationIdempotencyKey(input: {
  ownerId: string;
  eventType: string;
  sourceId: string;
  channel: string;
  eventVersion?: string;
}): string {
  const version = input.eventVersion ?? "v1";
  const raw = [
    input.ownerId,
    input.eventType,
    input.sourceId,
    input.channel,
    version,
  ].join("|");
  return createHash("sha256").update(raw).digest("hex").slice(0, 48);
}

export function rowToRecord(row: DurableInboxRow): NotificationRecord {
  return {
    notificationId: row.notificationId,
    userId: row.ownerId,
    audience: row.audience,
    type: row.eventType,
    title: row.title,
    message: row.body,
    relatedTaskId: row.relatedTaskId,
    relatedService: row.relatedService,
    isRead: Boolean(row.readAt) || row.status === "read",
    createdAt: row.createdAt,
    actionUrl: row.actionUrl,
    lineEvent: (row.lineEvent as NotificationRecord["lineEvent"]) ?? null,
    targetType: (row.targetType as NotificationRecord["targetType"]) ?? null,
    targetId: row.targetId,
    workflowRunId: row.workflowRunId,
    deliverableId: row.deliverableId,
    requestId: row.requestId,
    automationId: row.automationId,
    severity: (row.severity as NotificationRecord["severity"]) ?? null,
    eventCategory:
      (row.eventCategory as NotificationRecord["eventCategory"]) ?? null,
    pushSentAt: row.pushSentAt,
    pushFailedAt: row.pushFailedAt,
    pushFailureReason: row.pushFailureReason,
    readAt: row.readAt,
  };
}

function recordToRow(
  record: NotificationRecord,
  extras: {
    organizationId?: string | null;
    idempotencyKey: string;
    sourceType?: string | null;
    sourceId?: string | null;
    channel?: DurableInboxRow["channel"];
    status?: NotificationDeliveryStatus;
    diagnosticId?: string | null;
  },
): DurableInboxRow {
  const now = new Date().toISOString();
  const expiresAt = new Date(
    Date.now() + NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  return {
    notificationId: record.notificationId,
    ownerId: record.userId ?? "",
    organizationId: extras.organizationId ?? null,
    audience: record.audience,
    sourceType: extras.sourceType ?? record.type,
    sourceId:
      extras.sourceId ??
      record.requestId ??
      record.relatedTaskId ??
      record.notificationId,
    eventType: record.type,
    channel: extras.channel ?? "in_app",
    title: record.title,
    body: record.message,
    severity: record.severity ?? null,
    status: extras.status ?? (record.isRead ? "read" : "pending"),
    readAt: record.readAt ?? null,
    deliveredAt: null,
    failedAt: null,
    retryCount: 0,
    nextRetryAt: null,
    maxRetries: 5,
    idempotencyKey: extras.idempotencyKey,
    diagnosticId: extras.diagnosticId ?? `ndiag_${randomUUID().slice(0, 12)}`,
    metadata: {},
    relatedTaskId: record.relatedTaskId,
    relatedService: record.relatedService,
    actionUrl: record.actionUrl,
    targetType: record.targetType ?? null,
    targetId: record.targetId ?? null,
    workflowRunId: record.workflowRunId ?? null,
    deliverableId: record.deliverableId ?? null,
    requestId: record.requestId ?? null,
    automationId: record.automationId ?? null,
    lineEvent: record.lineEvent ?? null,
    eventCategory: record.eventCategory ?? null,
    pushSentAt: record.pushSentAt ?? null,
    pushFailedAt: record.pushFailedAt ?? null,
    pushFailureReason: record.pushFailureReason ?? null,
    createdAt: record.createdAt,
    updatedAt: now,
    expiresAt,
    deletedAt: null,
  };
}

function enforcePerUserRetention(ownerId: string): void {
  const rows = [...getMemoryBucket().values()]
    .filter((r) => r.ownerId === ownerId && !r.deletedAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (rows.length <= MAX_NOTIFICATIONS_PER_USER) return;
  for (const stale of rows.slice(MAX_NOTIFICATIONS_PER_USER)) {
    stale.deletedAt = new Date().toISOString();
    getMemoryBucket().set(stale.notificationId, stale);
  }
}

async function insertSupabase(
  row: DurableInboxRow,
): Promise<{ ok: true; row: DurableInboxRow; created: boolean } | { ok: false; error: string }> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    return { ok: false, error: "supabase_not_configured" };
  }
  const payload = {
    notification_id: row.notificationId,
    owner_id: row.ownerId,
    organization_id: row.organizationId,
    audience: row.audience,
    source_type: row.sourceType,
    source_id: row.sourceId,
    event_type: row.eventType,
    channel: row.channel,
    title: row.title,
    body: row.body,
    severity: row.severity,
    status: row.status,
    read_at: row.readAt,
    delivered_at: row.deliveredAt,
    failed_at: row.failedAt,
    retry_count: row.retryCount,
    next_retry_at: row.nextRetryAt,
    max_retries: row.maxRetries,
    idempotency_key: row.idempotencyKey,
    diagnostic_id: row.diagnosticId,
    metadata: row.metadata,
    related_task_id: row.relatedTaskId,
    related_service: row.relatedService,
    action_url: row.actionUrl,
    target_type: row.targetType,
    target_id: row.targetId,
    workflow_run_id: row.workflowRunId,
    deliverable_id: row.deliverableId,
    request_id: row.requestId,
    automation_id: row.automationId,
    line_event: row.lineEvent,
    event_category: row.eventCategory,
    push_sent_at: row.pushSentAt,
    push_failed_at: row.pushFailedAt,
    push_failure_reason: row.pushFailureReason,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    expires_at: row.expiresAt,
    deleted_at: row.deletedAt,
  };
  // Insert-only: partial unique index (owner_id, idempotency_key) WHERE deleted_at IS NULL
  // is not a reliable PostgREST onConflict target — handle 23505 explicitly.
  const { data, error } = await client
    .from("atlas_user_notifications")
    .insert(payload as never)
    .select("*")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      const existing = await client
        .from("atlas_user_notifications")
        .select("*")
        .eq("owner_id", row.ownerId)
        .eq("idempotency_key", row.idempotencyKey)
        .is("deleted_at", null)
        .maybeSingle();
      if (existing.data) {
        return {
          ok: true,
          created: false,
          row: dbRowToDurable(existing.data as Record<string, unknown>),
        };
      }
    }
    return { ok: false, error: error.message };
  }

  if (data) {
    return {
      ok: true,
      created: true,
      row: dbRowToDurable(data as Record<string, unknown>),
    };
  }

  return { ok: false, error: "insert_returned_empty" };
}

function dbRowToDurable(data: Record<string, unknown>): DurableInboxRow {
  return {
    notificationId: String(data.notification_id),
    ownerId: String(data.owner_id),
    organizationId: (data.organization_id as string | null) ?? null,
    audience: (data.audience as "user" | "owner") ?? "user",
    sourceType: (data.source_type as string | null) ?? null,
    sourceId: (data.source_id as string | null) ?? null,
    eventType: data.event_type as NotificationType,
    channel: (data.channel as DurableInboxRow["channel"]) ?? "in_app",
    title: String(data.title),
    body: String(data.body),
    severity: (data.severity as string | null) ?? null,
    status: (data.status as NotificationDeliveryStatus) ?? "pending",
    readAt: (data.read_at as string | null) ?? null,
    deliveredAt: (data.delivered_at as string | null) ?? null,
    failedAt: (data.failed_at as string | null) ?? null,
    retryCount: Number(data.retry_count ?? 0),
    nextRetryAt: (data.next_retry_at as string | null) ?? null,
    maxRetries: Number(data.max_retries ?? 5),
    idempotencyKey: String(data.idempotency_key),
    diagnosticId: (data.diagnostic_id as string | null) ?? null,
    metadata: (data.metadata as Record<string, unknown>) ?? {},
    relatedTaskId: (data.related_task_id as string | null) ?? null,
    relatedService: (data.related_service as string | null) ?? null,
    actionUrl: (data.action_url as string | null) ?? null,
    targetType: (data.target_type as string | null) ?? null,
    targetId: (data.target_id as string | null) ?? null,
    workflowRunId: (data.workflow_run_id as string | null) ?? null,
    deliverableId: (data.deliverable_id as string | null) ?? null,
    requestId: (data.request_id as string | null) ?? null,
    automationId: (data.automation_id as string | null) ?? null,
    lineEvent: (data.line_event as string | null) ?? null,
    eventCategory: (data.event_category as string | null) ?? null,
    pushSentAt: (data.push_sent_at as string | null) ?? null,
    pushFailedAt: (data.push_failed_at as string | null) ?? null,
    pushFailureReason: (data.push_failure_reason as string | null) ?? null,
    createdAt: String(data.created_at),
    updatedAt: String(data.updated_at),
    expiresAt: (data.expires_at as string | null) ?? null,
    deletedAt: (data.deleted_at as string | null) ?? null,
  };
}

/**
 * Insert (or return existing by idempotency) into Durable inbox.
 * Production: Supabase only — never succeeds on memory alone.
 */
export async function insertDurableNotification(
  record: NotificationRecord,
  options: {
    idempotencyKey: string;
    organizationId?: string | null;
    sourceType?: string | null;
    sourceId?: string | null;
    channel?: DurableInboxRow["channel"];
  },
): Promise<{ record: NotificationRecord; created: boolean; row: DurableInboxRow }> {
  if (!record.userId?.trim()) {
    throw new NotificationInboxUnavailableError(
      "[notifications] P0-4: ownerId/userId required for durable inbox",
    );
  }

  assertNotificationBackendReady();
  const backend = resolveNotificationStorageBackend();
  const row = recordToRow(record, {
    organizationId: options.organizationId,
    idempotencyKey: options.idempotencyKey,
    sourceType: options.sourceType,
    sourceId: options.sourceId,
    channel: options.channel,
  });

  if (backend === "supabase") {
    const startedAt = Date.now();
    const result = await insertSupabase(row);
    logAutomationNotificationPersistence({
      success: result.ok,
      durationMs: Date.now() - startedAt,
      persistenceTarget: "atlas_user_notifications",
      notificationId: row.notificationId,
      userId: row.ownerId,
      errorCode: result.ok
        ? null
        : classifyNotificationPersistError(result.error),
      stage: result.ok
        ? result.created
          ? "inbox_insert"
          : "inbox_upsert_duplicate"
        : "inbox_insert",
    });
    if (!result.ok) {
      throw new NotificationInboxUnavailableError(
        `[notifications] P0-4: durable insert failed — memory fallback disabled (${result.error})`,
      );
    }
    return {
      record: rowToRecord(result.row),
      created: result.created,
      row: result.row,
    };
  }

  if (backend === "memory_durable") {
    const bucket = getMemoryBucket();
    for (const existing of bucket.values()) {
      if (
        existing.ownerId === row.ownerId &&
        existing.idempotencyKey === row.idempotencyKey &&
        !existing.deletedAt
      ) {
        return {
          record: rowToRecord(existing),
          created: false,
          row: existing,
        };
      }
    }
    bucket.set(row.notificationId, row);
    enforcePerUserRetention(row.ownerId);
    return { record: rowToRecord(row), created: true, row };
  }

  // local/dev: memory_durable-equivalent for single process, still per-user capped
  const bucket = getMemoryBucket();
  for (const existing of bucket.values()) {
    if (
      existing.ownerId === row.ownerId &&
      existing.idempotencyKey === row.idempotencyKey &&
      !existing.deletedAt
    ) {
      return { record: rowToRecord(existing), created: false, row: existing };
    }
  }
  bucket.set(row.notificationId, row);
  enforcePerUserRetention(row.ownerId);
  return { record: rowToRecord(row), created: true, row };
}

export async function listDurableNotifications(input: {
  ownerId: string;
  organizationId?: string | null;
  limit?: number;
  includeDeleted?: boolean;
  /** In-app inbox only. Push/LINE-only rows stay durable but hidden from the bell. */
  inboxOnly?: boolean;
}): Promise<NotificationRecord[]> {
  if (!input.ownerId.trim()) {
    throw new NotificationInboxUnavailableError(
      "[notifications] P0-4: ownerId required for inbox list",
    );
  }

  const backend = resolveNotificationStorageBackend();
  const limit = Math.min(Math.max(input.limit ?? 100, 1), MAX_NOTIFICATIONS_PER_USER);
  const now = Date.now();

  if (backend === "supabase") {
    assertNotificationBackendReady();
    const client = createServiceRoleClientIfConfigured();
    if (!client) {
      throw new NotificationInboxUnavailableError(
        "[notifications] P0-4: list requires Supabase — memory fallback disabled",
      );
    }
    let query = client
      .from("atlas_user_notifications")
      .select("*")
      .eq("owner_id", input.ownerId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (input.organizationId) {
      query = query.eq("organization_id", input.organizationId);
    }
    if (input.inboxOnly) {
      query = query.eq("channel", "in_app");
    }
    const { data, error } = await query;
    if (error) {
      throw new NotificationInboxUnavailableError(
        `[notifications] P0-4: list failed (${error.message})`,
      );
    }
    return (data ?? [])
      .map((row) => dbRowToDurable(row as Record<string, unknown>))
      .filter(
        (r) => !r.expiresAt || new Date(r.expiresAt).getTime() > now,
      )
      .map(rowToRecord);
  }

  return [...getMemoryBucket().values()]
    .filter((r) => {
      if (r.ownerId !== input.ownerId) return false;
      if (!input.includeDeleted && r.deletedAt) return false;
      if (input.organizationId && r.organizationId !== input.organizationId) {
        return false;
      }
      if (input.inboxOnly && r.channel !== "in_app") return false;
      if (r.expiresAt && new Date(r.expiresAt).getTime() <= now) return false;
      return true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
    .map(rowToRecord);
}

export async function getDurableNotification(input: {
  notificationId: string;
  ownerId: string;
}): Promise<NotificationRecord | null> {
  if (!input.ownerId.trim()) return null;
  const backend = resolveNotificationStorageBackend();

  if (backend === "supabase") {
    assertNotificationBackendReady();
    const client = createServiceRoleClientIfConfigured();
    if (!client) {
      throw new NotificationInboxUnavailableError(
        "[notifications] P0-4: get requires Supabase",
      );
    }
    const { data, error } = await client
      .from("atlas_user_notifications")
      .select("*")
      .eq("notification_id", input.notificationId)
      .eq("owner_id", input.ownerId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) {
      throw new NotificationInboxUnavailableError(error.message);
    }
    if (!data) return null;
    return rowToRecord(dbRowToDurable(data as Record<string, unknown>));
  }

  const row = getMemoryBucket().get(input.notificationId);
  if (!row || row.deletedAt) return null;
  if (row.ownerId !== input.ownerId) return null;
  return rowToRecord(row);
}

export async function markDurableNotificationRead(input: {
  notificationId: string;
  ownerId: string;
}): Promise<NotificationRecord | null> {
  const existing = await getDurableNotification(input);
  if (!existing) return null;
  const readAt = existing.readAt ?? new Date().toISOString();
  const backend = resolveNotificationStorageBackend();

  if (backend === "supabase") {
    const client = createServiceRoleClientIfConfigured();
    if (!client) {
      throw new NotificationInboxUnavailableError(
        "[notifications] P0-4: mark-read requires Supabase",
      );
    }
    const { data, error } = await client
      .from("atlas_user_notifications")
      .update({
        read_at: readAt,
        status: "read",
        updated_at: new Date().toISOString(),
      } as never)
      .eq("notification_id", input.notificationId)
      .eq("owner_id", input.ownerId)
      .is("deleted_at", null)
      .select("*")
      .maybeSingle();
    if (error) {
      throw new NotificationInboxUnavailableError(error.message);
    }
    if (!data) return null;
    return rowToRecord(dbRowToDurable(data as Record<string, unknown>));
  }

  const row = getMemoryBucket().get(input.notificationId);
  if (!row || row.ownerId !== input.ownerId || row.deletedAt) return null;
  row.readAt = readAt;
  row.status = "read";
  row.updatedAt = new Date().toISOString();
  getMemoryBucket().set(row.notificationId, row);
  return rowToRecord(row);
}

export async function markAllDurableNotificationsRead(input: {
  ownerId: string;
}): Promise<number> {
  const list = await listDurableNotifications({
    ownerId: input.ownerId,
    limit: MAX_NOTIFICATIONS_PER_USER,
  });
  let count = 0;
  for (const n of list) {
    if (n.isRead) continue;
    await markDurableNotificationRead({
      notificationId: n.notificationId,
      ownerId: input.ownerId,
    });
    count += 1;
  }
  return count;
}

export async function softDeleteDurableNotification(input: {
  notificationId: string;
  ownerId: string;
}): Promise<boolean> {
  const backend = resolveNotificationStorageBackend();
  if (backend === "supabase") {
    const client = createServiceRoleClientIfConfigured();
    if (!client) {
      throw new NotificationInboxUnavailableError(
        "[notifications] P0-4: delete requires Supabase",
      );
    }
    const { data, error } = await client
      .from("atlas_user_notifications")
      .update({
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as never)
      .eq("notification_id", input.notificationId)
      .eq("owner_id", input.ownerId)
      .is("deleted_at", null)
      .select("notification_id")
      .maybeSingle();
    if (error) {
      throw new NotificationInboxUnavailableError(error.message);
    }
    return Boolean(data);
  }

  const row = getMemoryBucket().get(input.notificationId);
  if (!row || row.ownerId !== input.ownerId || row.deletedAt) return false;
  row.deletedAt = new Date().toISOString();
  row.updatedAt = new Date().toISOString();
  getMemoryBucket().set(row.notificationId, row);
  return true;
}

export async function countDurableUnread(ownerId: string): Promise<number> {
  if (!ownerId) return 0;
  const backend = resolveNotificationStorageBackend();
  if (backend === "supabase") {
    const client = createServiceRoleClientIfConfigured();
    if (client) {
      // P09: use indexed unread partial + count — avoid loading full inbox.
      const { count, error } = await client
        .from("atlas_user_notifications")
        .select("notification_id", { count: "exact", head: true })
        .eq("owner_id", ownerId)
        .eq("channel", "in_app")
        .is("deleted_at", null)
        .is("read_at", null);
      if (error) {
        throw new NotificationInboxUnavailableError(error.message);
      }
      return count ?? 0;
    }
    if (isNotificationDurableRequired()) {
      throw new NotificationInboxUnavailableError(
        "[notifications] P0-4: unread count requires Supabase",
      );
    }
  }

  const list = await listDurableNotifications({
    ownerId,
    limit: MAX_NOTIFICATIONS_PER_USER,
    inboxOnly: true,
  });
  return list.filter((n) => !n.isRead).length;
}

/** Retention cleanup — per-user soft delete of expired rows. */
export async function cleanupExpiredDurableNotifications(input?: {
  ownerId?: string;
  nowMs?: number;
}): Promise<number> {
  const now = input?.nowMs ?? Date.now();
  const backend = resolveNotificationStorageBackend();
  if (backend === "supabase") {
    const client = createServiceRoleClientIfConfigured();
    if (!client) {
      if (isNotificationDurableRequired()) {
        throw new NotificationInboxUnavailableError(
          "[notifications] P0-4: cleanup requires Supabase",
        );
      }
      return 0;
    }
    let query = client
      .from("atlas_user_notifications")
      .update({
        deleted_at: new Date(now).toISOString(),
        updated_at: new Date(now).toISOString(),
      } as never)
      .lt("expires_at", new Date(now).toISOString())
      .is("deleted_at", null)
      .select("notification_id");
    if (input?.ownerId) query = query.eq("owner_id", input.ownerId);
    const { data, error } = await query;
    if (error) {
      throw new NotificationInboxUnavailableError(error.message);
    }
    return data?.length ?? 0;
  }

  let n = 0;
  for (const row of getMemoryBucket().values()) {
    if (input?.ownerId && row.ownerId !== input.ownerId) continue;
    if (row.deletedAt) continue;
    if (row.expiresAt && new Date(row.expiresAt).getTime() <= now) {
      row.deletedAt = new Date(now).toISOString();
      n += 1;
    }
  }
  return n;
}

export async function findDurableNotificationByRequestId(input: {
  ownerId: string;
  requestId: string;
}): Promise<NotificationRecord | null> {
  const requestId = input.requestId.trim();
  if (!input.ownerId.trim() || !requestId) return null;
  const list = await listDurableNotifications({
    ownerId: input.ownerId,
    limit: MAX_NOTIFICATIONS_PER_USER,
  });
  return (
    list.find(
      (n) =>
        n.requestId === requestId ||
        n.relatedTaskId === requestId ||
        n.workflowRunId === requestId,
    ) ?? null
  );
}

export async function patchDurableNotification(input: {
  notificationId: string;
  ownerId: string;
  patch: Partial<NotificationRecord>;
}): Promise<NotificationRecord | null> {
  const existing = await getDurableNotification({
    notificationId: input.notificationId,
    ownerId: input.ownerId,
  });
  if (!existing) return null;

  const next: NotificationRecord = {
    ...existing,
    ...input.patch,
    notificationId: existing.notificationId,
    userId: existing.userId,
    audience: existing.audience,
  };
  if (input.patch.isRead === true && !next.readAt) {
    next.readAt = new Date().toISOString();
  }

  const backend = resolveNotificationStorageBackend();
  const now = new Date().toISOString();

  if (backend === "supabase") {
    const client = createServiceRoleClientIfConfigured();
    if (!client) {
      throw new NotificationInboxUnavailableError(
        "[notifications] P0-4: patch requires Supabase",
      );
    }
    const { data, error } = await client
      .from("atlas_user_notifications")
      .update({
        event_type: next.type,
        title: next.title,
        body: next.message,
        related_task_id: next.relatedTaskId,
        related_service: next.relatedService,
        action_url: next.actionUrl,
        target_type: next.targetType ?? null,
        target_id: next.targetId ?? null,
        workflow_run_id: next.workflowRunId ?? null,
        deliverable_id: next.deliverableId ?? null,
        request_id: next.requestId ?? null,
        automation_id: next.automationId ?? null,
        line_event: next.lineEvent ?? null,
        severity: next.severity ?? null,
        event_category: next.eventCategory ?? null,
        read_at: next.readAt ?? null,
        status: next.isRead ? "read" : undefined,
        updated_at: now,
      } as never)
      .eq("notification_id", input.notificationId)
      .eq("owner_id", input.ownerId)
      .is("deleted_at", null)
      .select("*")
      .maybeSingle();
    if (error) {
      throw new NotificationInboxUnavailableError(error.message);
    }
    if (!data) return null;
    return rowToRecord(dbRowToDurable(data as Record<string, unknown>));
  }

  const row = getMemoryBucket().get(input.notificationId);
  if (!row || row.ownerId !== input.ownerId || row.deletedAt) return null;
  const updatedRow = recordToRow(next, {
    organizationId: row.organizationId,
    idempotencyKey: row.idempotencyKey,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    channel: row.channel,
    status: next.isRead ? "read" : row.status,
    diagnosticId: row.diagnosticId,
  });
  updatedRow.createdAt = row.createdAt;
  updatedRow.deliveredAt = row.deliveredAt;
  updatedRow.failedAt = row.failedAt;
  updatedRow.retryCount = row.retryCount;
  updatedRow.nextRetryAt = row.nextRetryAt;
  updatedRow.maxRetries = row.maxRetries;
  updatedRow.expiresAt = row.expiresAt;
  updatedRow.deletedAt = row.deletedAt;
  updatedRow.updatedAt = now;
  getMemoryBucket().set(updatedRow.notificationId, updatedRow);
  return rowToRecord(updatedRow);
}

async function loadDurableRow(input: {
  notificationId: string;
  ownerId: string;
}): Promise<DurableInboxRow | null> {
  const backend = resolveNotificationStorageBackend();
  if (backend === "supabase") {
    assertNotificationBackendReady();
    const client = createServiceRoleClientIfConfigured();
    if (!client) return null;
    const { data } = await client
      .from("atlas_user_notifications")
      .select("*")
      .eq("notification_id", input.notificationId)
      .eq("owner_id", input.ownerId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!data) return null;
    return dbRowToDurable(data as Record<string, unknown>);
  }
  const row = getMemoryBucket().get(input.notificationId);
  if (!row || row.ownerId !== input.ownerId || row.deletedAt) return null;
  return row;
}

/** Durable external-delivery retry schedule (survives process restart on Supabase). */
export async function scheduleDurableDeliveryRetry(input: {
  notificationId: string;
  ownerId: string;
  errorMessage: string;
  delayMs?: number;
}): Promise<void> {
  const row = await loadDurableRow(input);
  if (!row) return;
  const retryCount = row.retryCount + 1;
  const permanent = retryCount > row.maxRetries;
  const nextRetryAt = permanent
    ? null
    : new Date(Date.now() + (input.delayMs ?? 60_000 * retryCount)).toISOString();

  await updateDurableDeliveryState({
    notificationId: input.notificationId,
    ownerId: input.ownerId,
    status: permanent ? "failed" : "retry_scheduled",
    pushFailedAt: new Date().toISOString(),
    pushFailureReason: input.errorMessage.slice(0, 500),
    retryCount,
    nextRetryAt,
  });
}

/** Soft lease while a tick worker processes a due retry (no schema change). */
export const NOTIFICATION_RETRY_CLAIM_LEASE_MS = 60_000;

type ClaimLockBucket = Map<string, Promise<void>>;

function getClaimLocks(): ClaimLockBucket {
  const scope = globalThis as typeof globalThis & {
    __atlasNotificationRetryClaimLocks?: ClaimLockBucket;
  };
  if (!scope.__atlasNotificationRetryClaimLocks) {
    scope.__atlasNotificationRetryClaimLocks = new Map();
  }
  return scope.__atlasNotificationRetryClaimLocks;
}

async function withRetryClaimLock<T>(
  key: string,
  fn: () => Promise<T> | T,
): Promise<T> {
  const locks = getClaimLocks();
  const previous = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  locks.set(
    key,
    previous.then(() => gate).catch(() => gate),
  );
  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
  }
}

/**
 * Multi-instance claim for a due retry row.
 * Wins by pushing next_retry_at into the future (lease) while status stays
 * retry_scheduled — other tick workers will not see it as due.
 */
export async function claimDueDeliveryRetry(input: {
  notificationId: string;
  ownerId: string;
  leaseOwner: string;
  leaseMs?: number;
  nowMs?: number;
}): Promise<DurableInboxRow | null> {
  const now = input.nowMs ?? Date.now();
  const nowIso = new Date(now).toISOString();
  const leaseMs = input.leaseMs ?? NOTIFICATION_RETRY_CLAIM_LEASE_MS;
  const leaseUntil = new Date(now + leaseMs).toISOString();
  const lockKey = `${input.ownerId}:${input.notificationId}`;

  return withRetryClaimLock(lockKey, async () => {
    const backend = resolveNotificationStorageBackend();

    if (backend === "supabase") {
      assertNotificationBackendReady();
      const client = createServiceRoleClientIfConfigured();
      if (!client) {
        throw new NotificationInboxUnavailableError(
          "[notifications] P1-02: retry claim requires Supabase",
        );
      }
      const { data, error } = await client
        .from("atlas_user_notifications")
        .update({
          next_retry_at: leaseUntil,
          updated_at: new Date().toISOString(),
          push_failure_reason: `claimed:${input.leaseOwner}`.slice(0, 500),
        } as never)
        .eq("notification_id", input.notificationId)
        .eq("owner_id", input.ownerId)
        .eq("status", "retry_scheduled")
        .is("deleted_at", null)
        .lte("next_retry_at", nowIso)
        .select("*")
        .maybeSingle();
      if (error) {
        throw new NotificationInboxUnavailableError(error.message);
      }
      if (!data) return null;
      const row = dbRowToDurable(data as Record<string, unknown>);
      if (row.ownerId !== input.ownerId) return null;
      return row;
    }

    const row = getMemoryBucket().get(input.notificationId);
    if (
      !row ||
      row.ownerId !== input.ownerId ||
      row.deletedAt ||
      row.status !== "retry_scheduled" ||
      !row.nextRetryAt ||
      row.nextRetryAt > nowIso
    ) {
      return null;
    }
    row.nextRetryAt = leaseUntil;
    row.updatedAt = new Date().toISOString();
    row.pushFailureReason = `claimed:${input.leaseOwner}`.slice(0, 500);
    return structuredClone(row);
  });
}

export async function listDueDeliveryRetries(input?: {
  limit?: number;
  nowMs?: number;
}): Promise<DurableInboxRow[]> {
  const limit = Math.min(Math.max(input?.limit ?? 50, 1), 200);
  const nowIso = new Date(input?.nowMs ?? Date.now()).toISOString();
  const backend = resolveNotificationStorageBackend();

  if (backend === "supabase") {
    assertNotificationBackendReady();
    const client = createServiceRoleClientIfConfigured();
    if (!client) {
      throw new NotificationInboxUnavailableError(
        "[notifications] P0-4: retry list requires Supabase",
      );
    }
    const { data, error } = await client
      .from("atlas_user_notifications")
      .select("*")
      .eq("status", "retry_scheduled")
      .is("deleted_at", null)
      .lte("next_retry_at", nowIso)
      .order("next_retry_at", { ascending: true })
      .limit(limit);
    if (error) {
      throw new NotificationInboxUnavailableError(error.message);
    }
    return (data ?? []).map((r) =>
      dbRowToDurable(r as Record<string, unknown>),
    );
  }

  return [...getMemoryBucket().values()]
    .filter(
      (r) =>
        !r.deletedAt &&
        r.status === "retry_scheduled" &&
        r.nextRetryAt != null &&
        r.nextRetryAt <= nowIso,
    )
    .sort((a, b) => (a.nextRetryAt ?? "").localeCompare(b.nextRetryAt ?? ""))
    .slice(0, limit);
}

export async function updateDurableDeliveryState(input: {
  notificationId: string;
  ownerId: string;
  status: NotificationDeliveryStatus;
  pushSentAt?: string | null;
  pushFailedAt?: string | null;
  pushFailureReason?: string | null;
  retryCount?: number;
  nextRetryAt?: string | null;
}): Promise<void> {
  const backend = resolveNotificationStorageBackend();
  if (backend === "supabase") {
    const client = createServiceRoleClientIfConfigured();
    if (!client) {
      throw new NotificationInboxUnavailableError(
        "[notifications] P0-4: delivery update requires Supabase",
      );
    }
    const { error } = await client
      .from("atlas_user_notifications")
      .update({
        status: input.status,
        delivered_at:
          input.status === "delivered" ? new Date().toISOString() : undefined,
        failed_at:
          input.status === "failed" ? new Date().toISOString() : undefined,
        push_sent_at: input.pushSentAt,
        push_failed_at: input.pushFailedAt,
        push_failure_reason: input.pushFailureReason,
        retry_count: input.retryCount,
        next_retry_at: input.nextRetryAt,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("notification_id", input.notificationId)
      .eq("owner_id", input.ownerId);
    if (error) {
      throw new NotificationInboxUnavailableError(error.message);
    }
    return;
  }

  const row = getMemoryBucket().get(input.notificationId);
  if (!row || row.ownerId !== input.ownerId) return;
  row.status = input.status;
  if (input.status === "delivered") row.deliveredAt = new Date().toISOString();
  if (input.status === "failed") row.failedAt = new Date().toISOString();
  if (input.pushSentAt !== undefined) row.pushSentAt = input.pushSentAt;
  if (input.pushFailedAt !== undefined) row.pushFailedAt = input.pushFailedAt;
  if (input.pushFailureReason !== undefined) {
    row.pushFailureReason = input.pushFailureReason;
  }
  if (input.retryCount !== undefined) row.retryCount = input.retryCount;
  if (input.nextRetryAt !== undefined) row.nextRetryAt = input.nextRetryAt;
  row.updatedAt = new Date().toISOString();
}
