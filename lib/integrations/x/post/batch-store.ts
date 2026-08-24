import "server-only";

import { randomUUID } from "node:crypto";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

import {
  resolveXPostStorageBackend,
  assertXPostBackendReady,
} from "./x-post-backend";
import { XPostStoreUnavailableError } from "./durable-x-post-jobs";
import type {
  XPostBatch,
  XPostBatchApprovalMode,
  XPostBatchApprovalStatus,
  XPostBatchItem,
  XPostBatchItemStatus,
  XPostBatchStatus,
} from "./batch-types";
import { isXPostBatchItemStatus, isXPostBatchStatus } from "./batch-types";
import { X_POST_BATCH_DEFAULT_TIMEZONE } from "./batch-config";

type MemoryBuckets = {
  batches: Map<string, XPostBatch>;
  items: Map<string, XPostBatchItem>;
};

function getMemory(): MemoryBuckets {
  const scope = globalThis as typeof globalThis & {
    __atlasXPostBatches?: MemoryBuckets;
  };
  if (!scope.__atlasXPostBatches) {
    scope.__atlasXPostBatches = {
      batches: new Map(),
      items: new Map(),
    };
  }
  return scope.__atlasXPostBatches;
}

export function resetXPostBatchStoreForTests(): void {
  const memory = getMemory();
  memory.batches.clear();
  memory.items.clear();
}

function nowIso(): string {
  return new Date().toISOString();
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function asNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "number" ? item : Number(item)))
    .filter((item) => Number.isInteger(item));
}

function batchFromRow(row: Record<string, unknown>): XPostBatch {
  const status = isXPostBatchStatus(row.status) ? row.status : "draft";
  return {
    id: String(row.batch_id ?? row.id ?? ""),
    ownerId: String(row.owner_id ?? ""),
    purpose: String(row.purpose ?? ""),
    theme: String(row.theme ?? ""),
    audience: String(row.audience ?? ""),
    tone: String(row.tone ?? ""),
    includeContent: String(row.include_content ?? ""),
    forbiddenContent: String(row.forbidden_content ?? ""),
    hashtagPolicy: String(row.hashtag_policy ?? ""),
    requestedCount: Number(row.requested_count ?? 0),
    startDate: String(row.start_date ?? ""),
    endDate: String(row.end_date ?? ""),
    daysOfWeek: asNumberArray(row.days_of_week),
    postTime: String(row.post_time ?? "10:00"),
    approvalMode:
      row.approval_mode === "full_auto" ? "full_auto" : "approval",
    timezone: String(row.timezone ?? X_POST_BATCH_DEFAULT_TIMEZONE),
    status,
    cancelRequested: Boolean(row.cancel_requested),
    generationAttempts: Number(row.generation_attempts ?? 0),
    costUsd: Number(row.cost_usd ?? 0),
    memoryApplied: Boolean(row.memory_applied),
    memoryLabels: asStringArray(row.memory_labels),
    memoryFailed: Boolean(row.memory_failed),
    connectionError:
      typeof row.connection_error === "string" ? row.connection_error : null,
    createdAt: String(row.created_at ?? nowIso()),
    updatedAt: String(row.updated_at ?? nowIso()),
  };
}

function itemFromRow(row: Record<string, unknown>): XPostBatchItem {
  const status = isXPostBatchItemStatus(row.status) ? row.status : "draft";
  const approval =
    row.approval_status === "approved" || row.approval_status === "rejected"
      ? row.approval_status
      : "pending";
  return {
    id: String(row.item_id ?? row.id ?? ""),
    batchId: String(row.batch_id ?? ""),
    ownerId: String(row.owner_id ?? ""),
    text: String(row.text ?? ""),
    angle: String(row.angle ?? ""),
    theme: String(row.theme ?? ""),
    hashtags: asStringArray(row.hashtags),
    sequence: Number(row.sequence ?? 0),
    approvalStatus: approval,
    scheduledFor:
      typeof row.scheduled_for === "string" ? row.scheduled_for : null,
    status,
    errorMessage:
      typeof row.error_message === "string" ? row.error_message : null,
    regenerateCount: Number(row.regenerate_count ?? 0),
    xPostJobId:
      typeof row.x_post_job_id === "string" ? row.x_post_job_id : null,
    idempotencyKey:
      typeof row.idempotency_key === "string" ? row.idempotency_key : null,
    createdAt: String(row.created_at ?? nowIso()),
    updatedAt: String(row.updated_at ?? nowIso()),
  };
}

function batchToRow(batch: XPostBatch): Record<string, unknown> {
  return {
    batch_id: batch.id,
    owner_id: batch.ownerId,
    purpose: batch.purpose,
    theme: batch.theme,
    audience: batch.audience,
    tone: batch.tone,
    include_content: batch.includeContent,
    forbidden_content: batch.forbiddenContent,
    hashtag_policy: batch.hashtagPolicy,
    requested_count: batch.requestedCount,
    start_date: batch.startDate,
    end_date: batch.endDate,
    days_of_week: batch.daysOfWeek,
    post_time: batch.postTime,
    approval_mode: batch.approvalMode,
    timezone: batch.timezone,
    status: batch.status,
    cancel_requested: batch.cancelRequested,
    generation_attempts: batch.generationAttempts,
    cost_usd: batch.costUsd,
    memory_applied: batch.memoryApplied,
    memory_labels: batch.memoryLabels,
    memory_failed: batch.memoryFailed,
    connection_error: batch.connectionError,
    created_at: batch.createdAt,
    updated_at: batch.updatedAt,
  };
}

function itemToRow(item: XPostBatchItem): Record<string, unknown> {
  return {
    item_id: item.id,
    batch_id: item.batchId,
    owner_id: item.ownerId,
    text: item.text,
    angle: item.angle,
    theme: item.theme,
    hashtags: item.hashtags,
    sequence: item.sequence,
    approval_status: item.approvalStatus,
    scheduled_for: item.scheduledFor,
    status: item.status,
    error_message: item.errorMessage,
    regenerate_count: item.regenerateCount,
    x_post_job_id: item.xPostJobId,
    idempotency_key: item.idempotencyKey,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
}

export function createEmptyBatch(input: {
  ownerId: string;
  purpose: string;
  theme: string;
  audience: string;
  tone: string;
  includeContent: string;
  forbiddenContent: string;
  hashtagPolicy: string;
  requestedCount: number;
  startDate: string;
  endDate: string;
  daysOfWeek: number[];
  postTime: string;
  approvalMode: XPostBatchApprovalMode;
  timezone: string;
}): XPostBatch {
  const now = nowIso();
  return {
    id: `xpb_${randomUUID()}`,
    ownerId: input.ownerId,
    purpose: input.purpose,
    theme: input.theme,
    audience: input.audience,
    tone: input.tone,
    includeContent: input.includeContent,
    forbiddenContent: input.forbiddenContent,
    hashtagPolicy: input.hashtagPolicy,
    requestedCount: input.requestedCount,
    startDate: input.startDate,
    endDate: input.endDate,
    daysOfWeek: input.daysOfWeek,
    postTime: input.postTime,
    approvalMode: input.approvalMode,
    timezone: input.timezone,
    status: "draft",
    cancelRequested: false,
    generationAttempts: 0,
    costUsd: 0,
    memoryApplied: false,
    memoryLabels: [],
    memoryFailed: false,
    connectionError: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function createEmptyItem(input: {
  batchId: string;
  ownerId: string;
  sequence: number;
  theme: string;
  angle?: string;
}): XPostBatchItem {
  const now = nowIso();
  return {
    id: `xpbi_${randomUUID()}`,
    batchId: input.batchId,
    ownerId: input.ownerId,
    text: "",
    angle: input.angle ?? "",
    theme: input.theme,
    hashtags: [],
    sequence: input.sequence,
    approvalStatus: "pending",
    scheduledFor: null,
    status: "draft",
    errorMessage: null,
    regenerateCount: 0,
    xPostJobId: null,
    idempotencyKey: null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function insertXPostBatch(batch: XPostBatch): Promise<XPostBatch> {
  assertXPostBackendReady();
  const backend = resolveXPostStorageBackend();
  if (backend === "supabase") {
    const client = createServiceRoleClientIfConfigured();
    if (!client) {
      throw new XPostStoreUnavailableError(
        "[x-post-batch] insert requires Supabase — Map fallback disabled",
      );
    }
    const { data, error } = await client
      .from("atlas_x_post_batches")
      .insert(batchToRow(batch) as never)
      .select("*")
      .maybeSingle();
    if (error || !data) {
      throw new XPostStoreUnavailableError(
        `[x-post-batch] insert failed — memory fallback disabled (${error?.message ?? "empty"})`,
      );
    }
    return batchFromRow(data as Record<string, unknown>);
  }
  getMemory().batches.set(batch.id, batch);
  return batch;
}

export async function updateXPostBatch(
  batch: XPostBatch,
): Promise<XPostBatch> {
  const next = { ...batch, updatedAt: nowIso() };
  assertXPostBackendReady();
  const backend = resolveXPostStorageBackend();
  if (backend === "supabase") {
    const client = createServiceRoleClientIfConfigured();
    if (!client) {
      throw new XPostStoreUnavailableError(
        "[x-post-batch] update requires Supabase — Map fallback disabled",
      );
    }
    const { data, error } = await client
      .from("atlas_x_post_batches")
      .update(batchToRow(next) as never)
      .eq("batch_id", next.id)
      .eq("owner_id", next.ownerId)
      .select("*")
      .maybeSingle();
    if (error || !data) {
      throw new XPostStoreUnavailableError(
        `[x-post-batch] update failed (${error?.message ?? "empty"})`,
      );
    }
    return batchFromRow(data as Record<string, unknown>);
  }
  getMemory().batches.set(next.id, next);
  return next;
}

export async function getXPostBatchForOwner(input: {
  batchId: string;
  ownerId: string;
}): Promise<XPostBatch | null> {
  if (!input.ownerId.trim() || !input.batchId.trim()) return null;
  assertXPostBackendReady();
  const backend = resolveXPostStorageBackend();
  if (backend === "supabase") {
    const client = createServiceRoleClientIfConfigured();
    if (!client) {
      throw new XPostStoreUnavailableError(
        "[x-post-batch] get requires Supabase — Map fallback disabled",
      );
    }
    const { data, error } = await client
      .from("atlas_x_post_batches")
      .select("*")
      .eq("batch_id", input.batchId)
      .eq("owner_id", input.ownerId)
      .maybeSingle();
    if (error) throw new XPostStoreUnavailableError(error.message);
    if (!data) return null;
    return batchFromRow(data as Record<string, unknown>);
  }
  const found = getMemory().batches.get(input.batchId);
  if (!found || found.ownerId !== input.ownerId) return null;
  return found;
}

export async function listXPostBatchesForOwner(input: {
  ownerId: string;
  limit?: number;
}): Promise<XPostBatch[]> {
  if (!input.ownerId.trim()) return [];
  assertXPostBackendReady();
  const backend = resolveXPostStorageBackend();
  const limit = input.limit ?? 20;
  if (backend === "supabase") {
    const client = createServiceRoleClientIfConfigured();
    if (!client) {
      throw new XPostStoreUnavailableError(
        "[x-post-batch] list requires Supabase — Map fallback disabled",
      );
    }
    const { data, error } = await client
      .from("atlas_x_post_batches")
      .select("*")
      .eq("owner_id", input.ownerId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new XPostStoreUnavailableError(error.message);
    return (data ?? []).map((row) => batchFromRow(row as Record<string, unknown>));
  }
  return [...getMemory().batches.values()]
    .filter((batch) => batch.ownerId === input.ownerId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export async function countGeneratingBatchesForOwner(
  ownerId: string,
): Promise<number> {
  if (!ownerId.trim()) return 0;
  const batches = await listXPostBatchesForOwner({ ownerId, limit: 50 });
  return batches.filter((batch) => batch.status === "generating").length;
}

export async function insertXPostBatchItems(
  items: XPostBatchItem[],
): Promise<XPostBatchItem[]> {
  if (items.length === 0) return [];
  assertXPostBackendReady();
  const backend = resolveXPostStorageBackend();
  if (backend === "supabase") {
    const client = createServiceRoleClientIfConfigured();
    if (!client) {
      throw new XPostStoreUnavailableError(
        "[x-post-batch] item insert requires Supabase — Map fallback disabled",
      );
    }
    const { data, error } = await client
      .from("atlas_x_post_batch_items")
      .insert(items.map(itemToRow) as never)
      .select("*");
    if (error) {
      throw new XPostStoreUnavailableError(
        `[x-post-batch] item insert failed — memory fallback disabled (${error.message})`,
      );
    }
    return (data ?? []).map((row) => itemFromRow(row as Record<string, unknown>));
  }
  const memory = getMemory();
  for (const item of items) memory.items.set(item.id, item);
  return items;
}

export async function updateXPostBatchItem(
  item: XPostBatchItem,
): Promise<XPostBatchItem> {
  const next = { ...item, updatedAt: nowIso() };
  assertXPostBackendReady();
  const backend = resolveXPostStorageBackend();
  if (backend === "supabase") {
    const client = createServiceRoleClientIfConfigured();
    if (!client) {
      throw new XPostStoreUnavailableError(
        "[x-post-batch] item update requires Supabase — Map fallback disabled",
      );
    }
    const { data, error } = await client
      .from("atlas_x_post_batch_items")
      .update(itemToRow(next) as never)
      .eq("item_id", next.id)
      .eq("owner_id", next.ownerId)
      .select("*")
      .maybeSingle();
    if (error || !data) {
      throw new XPostStoreUnavailableError(
        `[x-post-batch] item update failed (${error?.message ?? "empty"})`,
      );
    }
    return itemFromRow(data as Record<string, unknown>);
  }
  getMemory().items.set(next.id, next);
  return next;
}

export async function listXPostBatchItemsForOwner(input: {
  batchId: string;
  ownerId: string;
}): Promise<XPostBatchItem[]> {
  if (!input.ownerId.trim() || !input.batchId.trim()) return [];
  assertXPostBackendReady();
  const backend = resolveXPostStorageBackend();
  if (backend === "supabase") {
    const client = createServiceRoleClientIfConfigured();
    if (!client) {
      throw new XPostStoreUnavailableError(
        "[x-post-batch] item list requires Supabase — Map fallback disabled",
      );
    }
    const { data, error } = await client
      .from("atlas_x_post_batch_items")
      .select("*")
      .eq("batch_id", input.batchId)
      .eq("owner_id", input.ownerId)
      .order("sequence", { ascending: true });
    if (error) throw new XPostStoreUnavailableError(error.message);
    return (data ?? []).map((row) => itemFromRow(row as Record<string, unknown>));
  }
  return [...getMemory().items.values()]
    .filter(
      (item) => item.batchId === input.batchId && item.ownerId === input.ownerId,
    )
    .sort((a, b) => a.sequence - b.sequence);
}

export async function getXPostBatchItemForOwner(input: {
  itemId: string;
  ownerId: string;
}): Promise<XPostBatchItem | null> {
  if (!input.ownerId.trim() || !input.itemId.trim()) return null;
  assertXPostBackendReady();
  const backend = resolveXPostStorageBackend();
  if (backend === "supabase") {
    const client = createServiceRoleClientIfConfigured();
    if (!client) {
      throw new XPostStoreUnavailableError(
        "[x-post-batch] item get requires Supabase — Map fallback disabled",
      );
    }
    const { data, error } = await client
      .from("atlas_x_post_batch_items")
      .select("*")
      .eq("item_id", input.itemId)
      .eq("owner_id", input.ownerId)
      .maybeSingle();
    if (error) throw new XPostStoreUnavailableError(error.message);
    if (!data) return null;
    return itemFromRow(data as Record<string, unknown>);
  }
  const found = getMemory().items.get(input.itemId);
  if (!found || found.ownerId !== input.ownerId) return null;
  return found;
}

export async function deleteXPostBatchItemForOwner(input: {
  itemId: string;
  ownerId: string;
}): Promise<boolean> {
  const existing = await getXPostBatchItemForOwner(input);
  if (!existing) return false;
  assertXPostBackendReady();
  const backend = resolveXPostStorageBackend();
  if (backend === "supabase") {
    const client = createServiceRoleClientIfConfigured();
    if (!client) {
      throw new XPostStoreUnavailableError(
        "[x-post-batch] item delete requires Supabase — Map fallback disabled",
      );
    }
    const { error } = await client
      .from("atlas_x_post_batch_items")
      .delete()
      .eq("item_id", input.itemId)
      .eq("owner_id", input.ownerId);
    if (error) throw new XPostStoreUnavailableError(error.message);
    return true;
  }
  return getMemory().items.delete(input.itemId);
}

export async function listOccupiedScheduleInstants(input: {
  ownerId: string;
}): Promise<Set<string>> {
  const occupied = new Set<string>();
  const batches = await listXPostBatchesForOwner({
    ownerId: input.ownerId,
    limit: 40,
  });
  for (const batch of batches) {
    const items = await listXPostBatchItemsForOwner({
      batchId: batch.id,
      ownerId: input.ownerId,
    });
    for (const item of items) {
      if (
        item.scheduledFor &&
        (item.status === "approved" ||
          item.status === "scheduled" ||
          item.status === "publishing")
      ) {
        occupied.add(item.scheduledFor);
      }
    }
  }
  return occupied;
}

export function markItemStatus(
  item: XPostBatchItem,
  status: XPostBatchItemStatus,
  extra?: Partial<XPostBatchItem>,
): XPostBatchItem {
  return { ...item, ...extra, status, updatedAt: nowIso() };
}

export function markItemApproval(
  item: XPostBatchItem,
  approvalStatus: XPostBatchApprovalStatus,
): XPostBatchItem {
  const status: XPostBatchItemStatus =
    approvalStatus === "approved"
      ? item.status === "scheduled" || item.status === "published"
        ? item.status
        : "approved"
      : item.status === "published" || item.status === "publishing"
        ? item.status
        : "ready";
  return {
    ...item,
    approvalStatus,
    status,
    updatedAt: nowIso(),
  };
}

export type { XPostBatchStatus };
