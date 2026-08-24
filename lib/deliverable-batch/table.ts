import "server-only";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

import type { DeliverableBatch, DeliverableBatchItem } from "./types";

export const ATLAS_DELIVERABLE_BATCHES_TABLE = "atlas_deliverable_batches";
export const ATLAS_DELIVERABLE_BATCH_ITEMS_TABLE = "atlas_deliverable_batch_items";

type UntypedFrom = {
  from: (table: string) => {
    upsert: (
      row: unknown,
      opts?: { onConflict?: string },
    ) => PromiseLike<{ error: { message: string } | null }>;
    select: (cols: string) => {
      eq: (
        col: string,
        val: string,
      ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
    };
    delete: () => {
      eq: (
        col: string,
        val: string,
      ) => {
        eq: (
          col: string,
          val: string,
        ) => PromiseLike<{ error: { message: string } | null }>;
      };
    };
  };
};

function client(): UntypedFrom | null {
  const raw = createServiceRoleClientIfConfigured();
  return raw ? (raw as unknown as UntypedFrom) : null;
}

function batchRow(batch: DeliverableBatch) {
  return {
    id: batch.id,
    user_id: batch.userId,
    name: batch.name,
    input_type: batch.inputType,
    common: batch.common,
    format: batch.format,
    requested_count: batch.requestedCount,
    status: batch.status,
    sample_item_id: batch.sampleItemId,
    sample_approved: batch.sampleApproved,
    sample_style_note: batch.sampleStyleNote,
    style_candidate: batch.styleCandidate,
    duplicate_warnings: batch.duplicateWarnings,
    cancelled: batch.cancelled,
    created_at: batch.createdAt,
    updated_at: batch.updatedAt,
  };
}

function itemRow(item: DeliverableBatchItem) {
  return {
    id: item.id,
    batch_id: item.batchId,
    user_id: item.userId,
    order_index: item.order,
    input_type: item.inputType,
    input_reference: item.inputReference,
    title: item.title,
    theme: item.theme,
    individual_instruction: item.individualInstruction,
    forbidden: item.forbidden,
    file_name: item.fileName,
    output_format: item.outputFormat,
    output_artifact_id: item.outputArtifactId,
    work_job_id: item.workJobId,
    source_content: item.sourceContent,
    status: item.status,
    retry_count: item.retryCount,
    error: item.error,
    edited: item.edited,
    approved_at: item.approvedAt,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
}

export async function upsertDeliverableBatchRow(
  batch: DeliverableBatch,
): Promise<void> {
  const supabase = client();
  if (!supabase) return;
  const { error } = await supabase
    .from(ATLAS_DELIVERABLE_BATCHES_TABLE)
    .upsert(batchRow(batch), { onConflict: "user_id,id" });
  if (error) {
    console.warn("[deliverable-batch] batch upsert failed:", error.message);
  }
}

export async function upsertDeliverableBatchItemRow(
  item: DeliverableBatchItem,
): Promise<void> {
  const supabase = client();
  if (!supabase) return;
  const { error } = await supabase
    .from(ATLAS_DELIVERABLE_BATCH_ITEMS_TABLE)
    .upsert(itemRow(item), { onConflict: "user_id,id" });
  if (error) {
    console.warn("[deliverable-batch] item upsert failed:", error.message);
  }
}

export async function deleteDeliverableBatchItemRow(
  userId: string,
  itemId: string,
): Promise<void> {
  const supabase = client();
  if (!supabase) return;
  await supabase
    .from(ATLAS_DELIVERABLE_BATCH_ITEMS_TABLE)
    .delete()
    .eq("user_id", userId)
    .eq("id", itemId);
}

export async function loadDeliverableBatchRows(userId: string): Promise<{
  batches: DeliverableBatch[];
  items: DeliverableBatchItem[];
} | null> {
  const supabase = client();
  if (!supabase) return null;
  const batchesRes = await supabase
    .from(ATLAS_DELIVERABLE_BATCHES_TABLE)
    .select("*")
    .eq("user_id", userId);
  if (batchesRes.error || !batchesRes.data) return null;
  const itemsRes = await supabase
    .from(ATLAS_DELIVERABLE_BATCH_ITEMS_TABLE)
    .select("*")
    .eq("user_id", userId);
  if (itemsRes.error) return null;

  const batches = (batchesRes.data as Array<Record<string, unknown>>)
    .filter((row) => row.user_id === userId)
    .map(rowToBatch);
  const items = ((itemsRes.data as Array<Record<string, unknown>>) ?? [])
    .filter((row) => row.user_id === userId)
    .map(rowToItem);
  return { batches, items };
}

function rowToBatch(row: Record<string, unknown>): DeliverableBatch {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name ?? "まとめて作成"),
    inputType: row.input_type as DeliverableBatch["inputType"],
    common: (row.common ?? {}) as DeliverableBatch["common"],
    format: row.format as DeliverableBatch["format"],
    requestedCount: Number(row.requested_count ?? 0),
    status: row.status as DeliverableBatch["status"],
    sampleItemId: (row.sample_item_id as string | null) ?? null,
    sampleApproved: Boolean(row.sample_approved),
    sampleStyleNote: (row.sample_style_note as string | null) ?? null,
    styleCandidate: (row.style_candidate as string | null) ?? null,
    duplicateWarnings: Array.isArray(row.duplicate_warnings)
      ? (row.duplicate_warnings as string[])
      : [],
    cancelled: Boolean(row.cancelled),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function rowToItem(row: Record<string, unknown>): DeliverableBatchItem {
  return {
    id: String(row.id),
    batchId: String(row.batch_id),
    userId: String(row.user_id),
    order: Number(row.order_index ?? 0),
    inputType: row.input_type as DeliverableBatchItem["inputType"],
    inputReference: (row.input_reference as string | null) ?? null,
    title: String(row.title ?? ""),
    theme: String(row.theme ?? ""),
    individualInstruction: String(row.individual_instruction ?? ""),
    forbidden: String(row.forbidden ?? ""),
    fileName: (row.file_name as string | null) ?? null,
    outputFormat: row.output_format as DeliverableBatchItem["outputFormat"],
    outputArtifactId: (row.output_artifact_id as string | null) ?? null,
    workJobId: (row.work_job_id as string | null) ?? null,
    sourceContent: (row.source_content as string | null) ?? null,
    status: row.status as DeliverableBatchItem["status"],
    retryCount: Number(row.retry_count ?? 0),
    error: (row.error as string | null) ?? null,
    edited: Boolean(row.edited),
    approvedAt: (row.approved_at as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
