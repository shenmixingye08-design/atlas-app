import "server-only";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

import type { DeliverableFormat, GeneratedDeliverableFile } from "./types";

type DiskStoredDeliverable = GeneratedDeliverableFile & {
  id: string;
  generatedAt: string;
  userId: string;
  sourceContent: string;
  baseFileName: string;
};

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

type DurableMeta = {
  id: string;
  userId: string;
  fileName: string;
  format: DeliverableFormat;
  mimeType: string;
  generatedAt: string;
  sizeBytes: number;
  isPlaceholder: boolean;
  sourceContent: string;
  baseFileName: string;
  downloadedAt: string | null;
  downloadCount: number;
};

const ROOT = join(process.cwd(), ".data", "deliverables");

function userDir(userId: string): string {
  return join(ROOT, userId.replace(/[^a-zA-Z0-9_-]/g, "_"));
}

function metaPath(userId: string, id: string): string {
  return join(userDir(userId), `${id}.json`);
}

function binPath(userId: string, id: string): string {
  return join(userDir(userId), `${id}.bin`);
}

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

function persistToDisk(row: DurableDeliverableRow, buffer?: Buffer): boolean {
  try {
    const dir = userDir(row.userId);
    mkdirSync(dir, { recursive: true });
    const meta: DurableMeta = {
      id: row.id,
      userId: row.userId,
      fileName: row.fileName,
      format: row.format,
      mimeType: row.mimeType,
      generatedAt: row.generatedAt,
      sizeBytes: row.sizeBytes ?? 0,
      isPlaceholder: row.isPlaceholder,
      sourceContent: row.sourceContent,
      baseFileName: row.baseFileName,
      downloadedAt: null,
      downloadCount: 0,
    };
    writeFileSync(metaPath(row.userId, row.id), JSON.stringify(meta));
    if (buffer && buffer.byteLength > 0) {
      writeFileSync(binPath(row.userId, row.id), buffer);
    } else if (row.contentBase64) {
      writeFileSync(
        binPath(row.userId, row.id),
        Buffer.from(row.contentBase64, "base64"),
      );
    }
    return true;
  } catch (error) {
    console.warn("[deliverables] disk persist failed", error);
    return false;
  }
}

export function loadDeliverableFromDisk(
  id: string,
  userId: string,
): DiskStoredDeliverable | null {
  try {
    const metaFile = metaPath(userId, id);
    const dataFile = binPath(userId, id);
    if (!existsSync(metaFile)) return null;
    const meta = JSON.parse(readFileSync(metaFile, "utf8")) as DurableMeta;
    if (meta.userId !== userId) return null;
    let buffer = Buffer.alloc(0);
    if (existsSync(dataFile)) {
      buffer = readFileSync(dataFile);
    }
    return {
      id: meta.id,
      userId: meta.userId,
      fileName: meta.fileName,
      format: meta.format,
      mimeType: meta.mimeType,
      generatedAt: meta.generatedAt,
      isPlaceholder: meta.isPlaceholder,
      buffer,
      sourceContent: meta.sourceContent ?? "",
      baseFileName: meta.baseFileName ?? meta.fileName,
    };
  } catch {
    return null;
  }
}

/** @deprecated Prefer persistDurableDeliverable — kept for local disk sync. */
export function persistDeliverableToDisk(stored: DiskStoredDeliverable): void {
  const expiresAt = new Date(
    new Date(stored.generatedAt).getTime() + 1000 * 60 * 60,
  ).toISOString();
  persistToDisk(
    {
      id: stored.id,
      userId: stored.userId,
      fileName: stored.fileName,
      format: stored.format,
      mimeType: stored.mimeType,
      isPlaceholder: stored.isPlaceholder,
      sourceContent: stored.sourceContent ?? "",
      baseFileName: stored.baseFileName ?? stored.fileName,
      sizeBytes: stored.buffer.byteLength,
      contentBase64:
        stored.buffer.byteLength > 0
          ? stored.buffer.toString("base64")
          : null,
      generatedAt: stored.generatedAt,
      expiresAt,
    },
    stored.buffer,
  );
}

export function markDeliverableDownloaded(id: string, userId: string): boolean {
  try {
    const metaFile = metaPath(userId, id);
    if (!existsSync(metaFile)) return false;
    const meta = JSON.parse(readFileSync(metaFile, "utf8")) as DurableMeta;
    meta.downloadedAt = new Date().toISOString();
    meta.downloadCount = (meta.downloadCount ?? 0) + 1;
    writeFileSync(metaFile, JSON.stringify(meta));
    return true;
  } catch {
    return false;
  }
}

export async function persistDurableDeliverable(
  row: DurableDeliverableRow,
  buffer?: Buffer,
): Promise<{ diskOk: boolean; supabaseOk: boolean | null }> {
  getDurableMemory().set(row.id, row);
  const diskOk = persistToDisk(row, buffer);

  try {
    const client = createServiceRoleClientIfConfigured();
    if (!client) {
      // Supabase unconfigured: Word generation must still succeed via disk/memory.
      return { diskOk, supabaseOk: null };
    }
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
      // Disk/memory remain valid — do not fail Word generation for Supabase alone.
      return { diskOk, supabaseOk: false };
    }
    return { diskOk, supabaseOk: true };
  } catch (error) {
    console.error("[atlas_deliverable_files] upsert error", error);
    return { diskOk, supabaseOk: false };
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
    persistToDisk(mapped);
    return mapped;
  } catch (error) {
    console.error("[atlas_deliverable_files] select error", error);
    return null;
  }
}
