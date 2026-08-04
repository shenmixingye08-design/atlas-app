import "server-only";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

import {
  type DeliverableDeletionReason,
  type DeliverableStorageStatus,
  MAX_BASE64_CACHE_BYTES,
} from "./constants";
import { consumeWordFault } from "./fault-inject";
import {
  downloadDeliverableObject,
  readDeliverableSidecarMeta,
  uploadDeliverableObject,
  writeDeliverableSidecarMeta,
} from "./object-storage";
import {
  allowDeliverableDiskFallback,
  isDeliverableStorageRequired,
  resolveDeliverableStorageBackend,
} from "./storage-backend";
import type {
  DeliverableFormat,
  DeliverableMetadata,
  GeneratedDeliverableFile,
} from "./types";

type DiskStoredDeliverable = GeneratedDeliverableFile & {
  id: string;
  generatedAt: string;
  userId: string;
  sourceContent: string;
  baseFileName: string;
  contentSha256?: string | null;
  metadata?: DeliverableMetadata | null;
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
  contentSha256: string | null;
  storageBucket: string | null;
  storagePath: string | null;
  storageStatus: DeliverableStorageStatus;
  storageError: string | null;
  hasPkHeader: boolean | null;
  ooxmlVerified: boolean | null;
  downloadCount: number;
  lastDownloadedAt: string | null;
  deletionReason: DeliverableDeletionReason;
  deletedAt: string | null;
  metadata: DeliverableMetadata | null;
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

export const loadDeliverableFromDisk: (
  id: string,
  userId: string,
) => DiskStoredDeliverable | null = () => {
  // Disk under process.cwd()/.data removed — Supabase Storage/DB only.
  return null;
};

/** @deprecated No-op — disk persistence removed. */
export const persistDeliverableToDisk: (
  stored: DiskStoredDeliverable,
) => void = () => undefined;

export function markDeliverableDownloaded(id: string, userId: string): boolean {
  try {
    const mem = getDurableMemory().get(id);
    if (mem && mem.userId === userId) {
      mem.downloadCount = (mem.downloadCount ?? 0) + 1;
      mem.lastDownloadedAt = new Date().toISOString();
      getDurableMemory().set(id, mem);
      void updateDownloadStatsRemote(mem);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function updateDownloadStatsRemote(row: DurableDeliverableRow): Promise<void> {
  try {
    const client = createServiceRoleClientIfConfigured();
    if (!client) return;
    await client
      .from("atlas_deliverable_files")
      .update({
        download_count: row.downloadCount,
        last_downloaded_at: row.lastDownloadedAt,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", row.id)
      .eq("user_id", row.userId);
  } catch {
    /* non-fatal */
  }
}

export type PersistDurableResult = {
  ok: boolean;
  durable: boolean;
  storageStatus: DeliverableStorageStatus;
  storageError: string | null;
  row: DurableDeliverableRow;
};

/**
 * Persist metadata + binary.
 * Durable success in production requires Storage upload success.
 * Dev/local keeps memory/disk/base64 fallback.
 */
export async function persistDurableDeliverable(
  row: DurableDeliverableRow,
  buffer?: Buffer,
): Promise<PersistDurableResult> {
  let next: DurableDeliverableRow = { ...row };
  let storageError: string | null = null;

  if (buffer && buffer.byteLength > 0 && row.contentSha256) {
    const uploaded = await uploadDeliverableObject({
      userId: row.userId,
      deliverableId: row.id,
      format: row.format,
      mimeType: row.mimeType,
      sha256: row.contentSha256,
      buffer,
    });

    if (
      uploaded.ok &&
      (uploaded.backend === "supabase" || uploaded.backend === "memory_durable")
    ) {
      next = {
        ...next,
        storageBucket: uploaded.bucket,
        storagePath: uploaded.path,
        storageStatus: "stored",
        storageError: null,
        // Prefer Storage over large base64 in Postgres.
        contentBase64:
          buffer.byteLength <= MAX_BASE64_CACHE_BYTES
            ? buffer.toString("base64")
            : null,
      };
    } else if (uploaded.ok && uploaded.backend === "local") {
      next = {
        ...next,
        storageBucket: null,
        storagePath: null,
        storageStatus: buffer.byteLength <= MAX_BASE64_CACHE_BYTES
          ? "legacy_base64"
          : "pending",
        storageError: null,
        contentBase64:
          buffer.byteLength <= MAX_BASE64_CACHE_BYTES
            ? buffer.toString("base64")
            : next.contentBase64,
      };
    } else if (!uploaded.ok) {
      storageError = uploaded.error;
      const emergencyBase64 =
        buffer.byteLength <= MAX_BASE64_CACHE_BYTES
          ? buffer.toString("base64")
          : null;
      next = {
        ...next,
        storageStatus: emergencyBase64 ? "legacy_base64" : "failed",
        storageError,
        // Production emergency: keep small OOXML in Postgres when Storage upload fails.
        contentBase64: emergencyBase64 ?? next.contentBase64,
      };
      console.error(
        "[atlas_deliverable_files] storage upload failed",
        uploaded.error,
        { id: row.id, bytes: buffer.byteLength, usedBase64: Boolean(emergencyBase64) },
      );
    }
  }

  getDurableMemory().set(next.id, next);

  if (consumeWordFault("db_upsert")) {
    return {
      ok: false,
      durable: false,
      storageStatus: next.storageStatus,
      storageError: "fault_inject:db_upsert",
      row: next,
    };
  }

  let dbOk = true;
  let dbError: string | null = null;
  try {
    const client = createServiceRoleClientIfConfigured();
    if (client) {
      const meta = next.metadata ?? null;
      const fullPayload = {
        id: next.id,
        user_id: next.userId,
        file_name: next.fileName,
        format: next.format,
        mime_type: next.mimeType,
        is_placeholder: next.isPlaceholder,
        source_content: next.sourceContent,
        base_file_name: next.baseFileName,
        size_bytes: next.sizeBytes,
        content_base64: next.contentBase64,
        content_sha256: next.contentSha256,
        storage_bucket: next.storageBucket,
        storage_path: next.storagePath,
        storage_status: next.storageStatus,
        storage_error: next.storageError,
        has_pk_header: next.hasPkHeader,
        ooxml_verified: next.ooxmlVerified,
        download_count: next.downloadCount,
        last_downloaded_at: next.lastDownloadedAt,
        deletion_reason: next.deletionReason,
        deleted_at: next.deletedAt,
        deliverable_metadata: next.metadata,
        organization_id: meta?.organizationId ?? null,
        run_id: meta?.runId ?? null,
        job_id: meta?.jobId ?? null,
        step_id: meta?.stepId ?? null,
        diagnostic_id: meta?.diagnosticId ?? null,
        context_version: meta?.contextVersion ?? null,
        completion_evidence_id: meta?.completionEvidenceId ?? null,
        stored_at:
          next.storageStatus === "stored" ? new Date().toISOString() : null,
        generated_at: next.generatedAt,
        expires_at: next.expiresAt,
        created_at: next.generatedAt,
        updated_at: new Date().toISOString(),
      };
      const { error } = await client
        .from("atlas_deliverable_files")
        .upsert(fullPayload as never);
      if (error) {
        console.error(
          "[atlas_deliverable_files] upsert failed",
          error.message,
          error.code ?? "",
          error.details ?? "",
        );
        // Stage-3 columns may be missing if migration not applied — fall back
        // to the original schema so Word downloads still work via content_base64.
        const emergencyBase64 =
          next.contentBase64 ??
          (buffer && buffer.byteLength > 0 && buffer.byteLength <= 2 * 1024 * 1024
            ? buffer.toString("base64")
            : null);
        const legacyPayload = {
          id: next.id,
          user_id: next.userId,
          file_name: next.fileName,
          format: next.format,
          mime_type: next.mimeType,
          is_placeholder: next.isPlaceholder,
          source_content: next.sourceContent,
          base_file_name: next.baseFileName,
          size_bytes: next.sizeBytes,
          content_base64: emergencyBase64,
          generated_at: next.generatedAt,
          expires_at: next.expiresAt,
          created_at: next.generatedAt,
        };
        const legacy = await client
          .from("atlas_deliverable_files")
          .upsert(legacyPayload as never);
        if (legacy.error) {
          dbOk = false;
          dbError = `db_upsert_failed:${error.message}; legacy:${legacy.error.message}`;
          console.error(
            "[atlas_deliverable_files] legacy upsert failed",
            legacy.error.message,
          );
        } else {
          // Legacy row written — prefer base64 recovery path.
          next = {
            ...next,
            contentBase64: emergencyBase64,
            storageStatus:
              next.storageStatus === "stored"
                ? next.storageStatus
                : emergencyBase64
                  ? "legacy_base64"
                  : next.storageStatus,
            storageError: `stage3_upsert_failed:${error.message}`,
          };
          console.warn(
            "[atlas_deliverable_files] used legacy upsert after stage3 failure",
            error.message,
          );
        }
      }
    } else if (isDeliverableStorageRequired()) {
      if (resolveDeliverableStorageBackend() === "memory_durable") {
        // Test durable SoT: process durable-memory row stands in for DB metadata.
        dbOk = true;
      } else {
        dbOk = false;
        dbError = "supabase_service_role_missing";
      }
    }
  } catch (error) {
    dbOk = false;
    dbError =
      error instanceof Error
        ? `db_upsert_exception:${error.message}`
        : "db_upsert_exception";
    console.error("[atlas_deliverable_files] upsert error", error);
  }

  const storageOk =
    next.storageStatus === "stored" ||
    next.storageStatus === "legacy_base64" ||
    (allowDeliverableDiskFallback() && Boolean(buffer?.byteLength));

  // When Postgres table is missing (common before migration), keep Word durable
  // via Storage binary + meta.json sidecar.
  let sidecarOk = false;
  const tableMissing =
    Boolean(dbError) &&
    /could not find the table|schema cache|does not exist|relation .* does not exist/i.test(
      dbError ?? "",
    );

  if (
    next.storageStatus === "stored" &&
    next.storageBucket &&
    next.storagePath &&
    (tableMissing || !dbOk)
  ) {
    const sidecar = await writeDeliverableSidecarMeta({
      id: next.id,
      userId: next.userId,
      fileName: next.fileName,
      format: next.format,
      mimeType: next.mimeType,
      isPlaceholder: next.isPlaceholder,
      sourceContent: next.sourceContent,
      baseFileName: next.baseFileName,
      sizeBytes: next.sizeBytes,
      contentSha256: next.contentSha256,
      storageBucket: next.storageBucket,
      storagePath: next.storagePath,
      storageStatus: "stored",
      hasPkHeader: next.hasPkHeader,
      ooxmlVerified: next.ooxmlVerified,
      metadata: next.metadata,
      generatedAt: next.generatedAt,
      expiresAt: next.expiresAt,
    });
    sidecarOk = sidecar.ok;
    if (!sidecar.ok) {
      console.error(
        "[atlas_deliverable_files] sidecar meta write failed",
        sidecar.error,
      );
      if (!dbError) dbError = `sidecar_meta_failed:${sidecar.error}`;
      else dbError = `${dbError}; sidecar_meta_failed:${sidecar.error}`;
    } else {
      console.warn(
        "[atlas_deliverable_files] durable via Storage sidecar (DB unavailable)",
        { id: next.id, tableMissing },
      );
    }
  }

  // P0-3 Production / required storage: object must be `stored` (+ DB or sidecar).
  // legacy_base64 alone is NOT durable when Storage is required.
  const durable = allowDeliverableDiskFallback()
    ? storageOk || Boolean(next.contentBase64) || Boolean(buffer?.byteLength)
    : next.storageStatus === "stored" &&
      Boolean(next.storageBucket) &&
      Boolean(next.storagePath) &&
      (dbOk || sidecarOk);

  const resolvedError =
    durable
      ? null
      : next.storageError ??
        storageError ??
        dbError ??
        `not_durable:status=${next.storageStatus};dbOk=${dbOk};sidecarOk=${sidecarOk}`;

  if (!durable) {
    console.error("[atlas_deliverable_files] persist not durable", {
      id: next.id,
      storageStatus: next.storageStatus,
      dbOk,
      sidecarOk,
      storageError: next.storageError ?? storageError,
      dbError,
      hasBase64: Boolean(next.contentBase64),
      hasBuffer: Boolean(buffer?.byteLength),
    });
  }

  return {
    ok: durable,
    durable,
    storageStatus: next.storageStatus,
    storageError: resolvedError,
    row: next,
  };
}

export async function loadDurableDeliverable(
  id: string,
  userId?: string | null,
): Promise<DurableDeliverableRow | null> {
  const mem = getDurableMemory().get(id);
  if (mem) {
    if (mem.deletedAt) return null;
    // Memory cache of the durable ROW is fine past binary memory TTL.
    // Only hard-hide when explicitly deleted.
    if (
      new Date(mem.expiresAt).getTime() < Date.now() &&
      !mem.sourceContent.trim()
    ) {
      getDurableMemory().delete(id);
    } else {
      return mem;
    }
  }

  try {
    const client = createServiceRoleClientIfConfigured();
    if (client) {
      const { data, error } = await client
        .from("atlas_deliverable_files")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) {
        console.error("[atlas_deliverable_files] select failed", error.message);
        // Fall through to Storage sidecar when the table is missing.
      } else if (data) {
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
          content_sha256?: string | null;
          storage_bucket?: string | null;
          storage_path?: string | null;
          storage_status?: string | null;
          storage_error?: string | null;
          has_pk_header?: boolean | null;
          ooxml_verified?: boolean | null;
          download_count?: number | null;
          last_downloaded_at?: string | null;
          deletion_reason?: string | null;
          deleted_at?: string | null;
          deliverable_metadata?: DeliverableMetadata | null;
          generated_at: string;
          expires_at: string;
        };

        if (row.deleted_at) {
          return null;
        }

        const expired = new Date(row.expires_at).getTime() < Date.now();
        // Expired WITHOUT source → gone. Expired WITH source → regeneratable.
        if (expired && !row.source_content?.trim()) {
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
          contentSha256: row.content_sha256 ?? null,
          storageBucket: row.storage_bucket ?? null,
          storagePath: row.storage_path ?? null,
          storageStatus:
            (row.storage_status as DeliverableStorageStatus) ?? "pending",
          storageError: row.storage_error ?? null,
          hasPkHeader: row.has_pk_header ?? null,
          ooxmlVerified: row.ooxml_verified ?? null,
          downloadCount: row.download_count ?? 0,
          lastDownloadedAt: row.last_downloaded_at ?? null,
          deletionReason:
            (row.deletion_reason as DeliverableDeletionReason) ?? null,
          deletedAt: row.deleted_at ?? null,
          metadata: row.deliverable_metadata ?? null,
          generatedAt: row.generated_at,
          expiresAt: row.expires_at,
        };
        getDurableMemory().set(mapped.id, mapped);
        return mapped;
      }
    }
  } catch (error) {
    console.error("[atlas_deliverable_files] select exception", error);
  }

  if (userId) {
    const sidecar = await readDeliverableSidecarMeta({
      userId,
      deliverableId: id,
    });
    if (sidecar) {
      const mapped: DurableDeliverableRow = {
        id: sidecar.id,
        userId: sidecar.userId,
        fileName: sidecar.fileName,
        format: sidecar.format,
        mimeType: sidecar.mimeType,
        isPlaceholder: sidecar.isPlaceholder,
        sourceContent: sidecar.sourceContent,
        baseFileName: sidecar.baseFileName,
        sizeBytes: sidecar.sizeBytes,
        contentBase64: null,
        contentSha256: sidecar.contentSha256,
        storageBucket: sidecar.storageBucket,
        storagePath: sidecar.storagePath,
        storageStatus: "stored",
        storageError: null,
        hasPkHeader: sidecar.hasPkHeader,
        ooxmlVerified: sidecar.ooxmlVerified,
        downloadCount: 0,
        lastDownloadedAt: null,
        deletionReason: null,
        deletedAt: null,
        metadata: (sidecar.metadata as DeliverableMetadata | null) ?? null,
        generatedAt: sidecar.generatedAt,
        expiresAt: sidecar.expiresAt,
      };
      getDurableMemory().set(mapped.id, mapped);
      return mapped;
    }
  }

  return null;
}

export async function updateDurableDeliverableMetadata(input: {
  id: string;
  userId: string;
  metadata: DeliverableMetadata;
}): Promise<void> {
  const current = getDurableMemory().get(input.id);
  if (current && current.userId === input.userId) {
    const updated: DurableDeliverableRow = {
      ...current,
      metadata: input.metadata,
    };
    getDurableMemory().set(input.id, updated);
  }

  try {
    const client = createServiceRoleClientIfConfigured();
    if (!client) return;
    await client
      .from("atlas_deliverable_files")
      .update({
        deliverable_metadata: input.metadata,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", input.id)
      .eq("user_id", input.userId);
  } catch {
    /* metadata update is non-fatal; binary is already durable */
  }
}

/** Load binary bytes from Storage using durable row pointers. */
export async function loadBinaryFromDurableStorage(
  row: DurableDeliverableRow,
): Promise<Buffer | null> {
  if (row.storageBucket && row.storagePath) {
    const downloaded = await downloadDeliverableObject({
      bucket: row.storageBucket,
      path: row.storagePath,
    });
    if (downloaded.ok) return downloaded.buffer;
  }
  if (row.contentBase64) {
    const buffer = Buffer.from(row.contentBase64, "base64");
    if (buffer.byteLength > 0) return buffer;
  }
  return null;
}
