import "server-only";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

import type { DeliverableFormat } from "./types";

export type DurableDeliverableRow = {
  id: string;
  userId: string;
  fileName: string;
  format: DeliverableFormat;
  mimeType: string;
  isPlaceholder: boolean;
  sourceContent: string;
  baseFileName: string;
  sizeBytes: number | null;
  contentBase64: string | null;
  generatedAt: string;
  expiresAt: string;
};

type MemoryDurableBucket = Map<string, DurableDeliverableRow>;

/** Test / no-Supabase fallback that still survives a cleared binary memory cache. */
function getDurableMemory(): MemoryDurableBucket {
  const scope = globalThis as typeof globalThis & {
    __atlasDeliverableDurable?: MemoryDurableBucket;
  };
  if (!scope.__atlasDeliverableDurable) {
    scope.__atlasDeliverableDurable = new Map();
  }
  return scope.__atlasDeliverableDurable;
}

export function resetDurableDeliverableStoreForTests(): void {
  const scope = globalThis as typeof globalThis & {
    __atlasDeliverableDurable?: MemoryDurableBucket;
  };
  scope.__atlasDeliverableDurable = new Map();
}

export async function persistDurableDeliverable(
  row: DurableDeliverableRow,
): Promise<void> {
  getDurableMemory().set(row.id, row);

  try {
    const client = createServiceRoleClientIfConfigured();
    if (!client) return;
    const { error } = await client.from("atlas_deliverable_files").upsert({
      id: row.id,
      user_id: row.userId,
      file_name: row.fileName,
      format: row.format,
      mime_type: row.mimeType,
      is_placeholder: row.isPlaceholder,
      source_content: row.sourceContent,
      base_file_name: row.baseFileName,
      size_bytes: row.sizeBytes,
      content_base64: row.contentBase64,
      generated_at: row.generatedAt,
      expires_at: row.expiresAt,
      created_at: row.generatedAt,
    } as never);
    if (error) {
      console.error("[atlas_deliverable_files] upsert failed", error.message);
    }
  } catch (error) {
    console.error("[atlas_deliverable_files] upsert error", error);
  }
}

export async function loadDurableDeliverable(
  id: string,
): Promise<DurableDeliverableRow | null> {
  const mem = getDurableMemory().get(id);
  if (mem) {
    if (new Date(mem.expiresAt).getTime() < Date.now()) {
      getDurableMemory().delete(id);
    } else {
      return mem;
    }
  }

  try {
    const client = createServiceRoleClientIfConfigured();
    if (!client) return null;
    const { data, error } = await client
      .from("atlas_deliverable_files")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      console.error("[atlas_deliverable_files] select failed", error.message);
      return null;
    }
    if (!data) return null;

    const row = data as {
      id: string;
      user_id: string;
      file_name: string;
      format: string;
      mime_type: string;
      is_placeholder: boolean;
      source_content: string;
      base_file_name: string;
      size_bytes: number | null;
      content_base64: string | null;
      generated_at: string;
      expires_at: string;
    };

    if (new Date(row.expires_at).getTime() < Date.now()) {
      void client.from("atlas_deliverable_files").delete().eq("id", id);
      return null;
    }

    const mapped: DurableDeliverableRow = {
      id: row.id,
      userId: row.user_id,
      fileName: row.file_name,
      format: row.format as DeliverableFormat,
      mimeType: row.mime_type,
      isPlaceholder: row.is_placeholder,
      sourceContent: row.source_content,
      baseFileName: row.base_file_name,
      sizeBytes: row.size_bytes,
      contentBase64: row.content_base64,
      generatedAt: row.generated_at,
      expiresAt: row.expires_at,
    };
    getDurableMemory().set(mapped.id, mapped);
    return mapped;
  } catch (error) {
    console.error("[atlas_deliverable_files] select error", error);
    return null;
  }
}
