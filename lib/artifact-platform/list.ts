import "server-only";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";
import {
  loadDurableDeliverable,
  type DurableDeliverableRow,
} from "@/lib/deliverables/durable-store";
import { findVersionGroupByDeliverableIdAsync } from "@/lib/deliverables/versioning";
import type { DeliverableFormat, DeliverableMetadata } from "@/lib/deliverables/types";
import type { DeliverableStorageStatus, DeliverableDeletionReason } from "@/lib/deliverables/constants";

import { mapRowToUnifiedArtifact } from "./register";
import { normalizeArtifactFormat } from "./formats";
import type { ArtifactFormat, UnifiedArtifact } from "./types";

export type ListArtifactsQuery = {
  userId: string;
  formats?: ArtifactFormat[];
  latestOnly?: boolean;
  status?: Array<"completed" | "failed" | "generating" | "deleted">;
  includeDeleted?: boolean;
  sort?: "newest" | "oldest" | "fileName" | "format" | "size" | "updated";
  q?: string;
  limit?: number;
  offset?: number;
};

function memoryRowsForUser(userId: string): DurableDeliverableRow[] {
  const scope = globalThis as typeof globalThis & {
    __atlasDeliverableDurable?: Map<string, DurableDeliverableRow>;
  };
  const mem = scope.__atlasDeliverableDurable;
  if (!mem) return [];
  return [...mem.values()].filter((r) => r.userId === userId);
}

function mapDbToRow(row: Record<string, unknown>): DurableDeliverableRow {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    fileName: String(row.file_name),
    format: row.format as DeliverableFormat,
    mimeType: String(row.mime_type),
    isPlaceholder: Boolean(row.is_placeholder),
    sourceContent: String(row.source_content ?? ""),
    baseFileName: String(row.base_file_name ?? ""),
    sizeBytes: (row.size_bytes as number | null) ?? null,
    contentBase64: (row.content_base64 as string | null) ?? null,
    contentSha256: (row.content_sha256 as string | null) ?? null,
    storageBucket: (row.storage_bucket as string | null) ?? null,
    storagePath: (row.storage_path as string | null) ?? null,
    storageStatus: ((row.storage_status as string) ??
      "pending") as DeliverableStorageStatus,
    storageError: (row.storage_error as string | null) ?? null,
    hasPkHeader: (row.has_pk_header as boolean | null) ?? null,
    ooxmlVerified: (row.ooxml_verified as boolean | null) ?? null,
    downloadCount: Number(row.download_count ?? 0),
    lastDownloadedAt: (row.last_downloaded_at as string | null) ?? null,
    deletionReason: (row.deletion_reason as DeliverableDeletionReason) ?? null,
    deletedAt: (row.deleted_at as string | null) ?? null,
    metadata: (row.deliverable_metadata as DeliverableMetadata | null) ?? null,
    generatedAt: String(row.generated_at),
    expiresAt: String(row.expires_at),
  };
}

export async function listUnifiedArtifacts(
  query: ListArtifactsQuery
): Promise<{ items: UnifiedArtifact[]; total: number }> {
  const limit = Math.min(query.limit ?? 50, 200);
  const offset = query.offset ?? 0;
  let rows: DurableDeliverableRow[] = memoryRowsForUser(query.userId);

  try {
    const client = createServiceRoleClientIfConfigured();
    if (client) {
      let q = client
        .from("atlas_deliverable_files")
        .select("*")
        .eq("user_id", query.userId)
        .order("generated_at", { ascending: false })
        .limit(500);
      if (!query.includeDeleted) {
        q = q.is("deleted_at", null);
      }
      const { data, error } = await q;
      if (!error && data) {
        const remote = (data as Record<string, unknown>[]).map(mapDbToRow);
        const byId = new Map<string, DurableDeliverableRow>();
        for (const r of [...rows, ...remote]) byId.set(r.id, r);
        rows = [...byId.values()];
      }
    }
  } catch {
    /* memory fallback */
  }

  let items: UnifiedArtifact[] = [];
  for (const row of rows) {
    if (!query.includeDeleted && row.deletedAt) continue;
    const version = await findVersionGroupByDeliverableIdAsync(row.id);
    const artifact = mapRowToUnifiedArtifact(row, {
      revisionNumber: version?.record.version,
      isLatest: version?.record.isLatest ?? true,
      versionGroupId: version?.groupId ?? null,
    });
    items.push(artifact);
  }

  if (query.formats?.length) {
    const set = new Set(query.formats.map((f) => normalizeArtifactFormat(f)));
    items = items.filter((a) => set.has(a.format));
  }

  if (query.latestOnly) {
    items = items.filter((a) => a.isLatest);
  }

  if (query.status?.length) {
    const set = new Set(query.status);
    items = items.filter((a) => set.has(a.status as never));
  }

  if (query.q?.trim()) {
    const q = query.q.trim().toLowerCase();
    items = items.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.fileName.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q)
    );
  }

  switch (query.sort) {
    case "oldest":
      items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      break;
    case "fileName":
      items.sort((a, b) => a.fileName.localeCompare(b.fileName, "ja"));
      break;
    case "format":
      items.sort((a, b) => a.format.localeCompare(b.format));
      break;
    case "size":
      items.sort((a, b) => b.fileSize - a.fileSize);
      break;
    case "updated":
      items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      break;
    case "newest":
    default:
      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  const total = items.length;
  return { items: items.slice(offset, offset + limit), total };
}

export async function getArtifactDetail(input: {
  id: string;
  userId: string;
}): Promise<{
  artifact: UnifiedArtifact;
  revisions: UnifiedArtifact[];
  conversions: Array<Record<string, unknown>>;
} | null> {
  const row = await loadDurableDeliverable(input.id, input.userId);
  if (!row || row.userId !== input.userId) return null;
  const version = await findVersionGroupByDeliverableIdAsync(input.id);
  const artifact = mapRowToUnifiedArtifact(row, {
    revisionNumber: version?.record.version,
    isLatest: version?.record.isLatest,
    versionGroupId: version?.groupId ?? null,
  });

  const revisions: UnifiedArtifact[] = [];
  if (artifact.versionGroupId) {
    const { listDeliverableVersionsAsync } = await import(
      "@/lib/deliverables/versioning"
    );
    const vers = await listDeliverableVersionsAsync(artifact.versionGroupId);
    for (const v of vers) {
      const r = await loadDurableDeliverable(v.deliverableId, input.userId);
      if (!r || r.userId !== input.userId) continue;
      revisions.push(
        mapRowToUnifiedArtifact(r, {
          revisionNumber: v.version,
          isLatest: v.isLatest,
          versionGroupId: v.groupId,
        })
      );
    }
  }

  const conversions = Array.isArray(artifact.metadata.conversionHistory)
    ? artifact.metadata.conversionHistory
    : [];

  return { artifact, revisions, conversions };
}
