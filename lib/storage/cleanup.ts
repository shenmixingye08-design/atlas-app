/**
 * Safe cleanup: temp, partial/failed uploads, orphan revisions, expired URL tokens, thumbnails.
 * Memory-first; durable Soft-delete markers when present.
 */

import type { StoredDeliverable } from "@/lib/deliverables/store";
import { listDeliverableVersions } from "@/lib/deliverables/versioning";

export type CleanupCandidateKind =
  | "temp"
  | "partial_upload"
  | "failed_upload"
  | "orphan_revision"
  | "expired_url"
  | "orphan_thumbnail"
  | "zero_byte_failed";

export type CleanupCandidate = {
  kind: CleanupCandidateKind;
  artifactId: string;
  reason: string;
};

export type CleanupReport = {
  scanned: number;
  deleted: string[];
  skipped: string[];
  candidates: CleanupCandidate[];
};

type SoftDeleted = {
  id: string;
  deletedAt: string;
  reason: string;
};

function getSoftDeleteBucket(): Map<string, SoftDeleted> {
  const g = globalThis as typeof globalThis & {
    __atlasArtifactSoftDeletes?: Map<string, SoftDeleted>;
  };
  if (!g.__atlasArtifactSoftDeletes) {
    g.__atlasArtifactSoftDeletes = new Map();
  }
  return g.__atlasArtifactSoftDeletes;
}

function getTempBucket(): Map<string, { createdAt: number; ownerId: string }> {
  const g = globalThis as typeof globalThis & {
    __atlasArtifactTemps?: Map<string, { createdAt: number; ownerId: string }>;
  };
  if (!g.__atlasArtifactTemps) g.__atlasArtifactTemps = new Map();
  return g.__atlasArtifactTemps;
}

function getThumbnailBucket(): Map<string, { createdAt: number }> {
  const g = globalThis as typeof globalThis & {
    __atlasArtifactThumbnails?: Map<string, { createdAt: number }>;
  };
  if (!g.__atlasArtifactThumbnails) g.__atlasArtifactThumbnails = new Map();
  return g.__atlasArtifactThumbnails;
}

function getExpiredUrlBucket(): Map<string, number> {
  const g = globalThis as typeof globalThis & {
    __atlasExpiredSignedUrls?: Map<string, number>;
  };
  if (!g.__atlasExpiredSignedUrls) g.__atlasExpiredSignedUrls = new Map();
  return g.__atlasExpiredSignedUrls;
}

export function trackTempUpload(id: string, ownerId: string): void {
  getTempBucket().set(id, { createdAt: Date.now(), ownerId });
}

export function trackThumbnail(id: string): void {
  getThumbnailBucket().set(id, { createdAt: Date.now() });
}

export function trackExpiredSignedUrl(tokenKey: string, exp: number): void {
  getExpiredUrlBucket().set(tokenKey, exp);
}

export function softDeleteArtifact(
  artifactId: string,
  reason: string,
): void {
  getSoftDeleteBucket().set(artifactId, {
    id: artifactId,
    deletedAt: new Date().toISOString(),
    reason,
  });
}

export function isSoftDeleted(artifactId: string): boolean {
  return getSoftDeleteBucket().has(artifactId);
}

export function resetStorageCleanupForTests(): void {
  getSoftDeleteBucket().clear();
  getTempBucket().clear();
  getThumbnailBucket().clear();
  getExpiredUrlBucket().clear();
}

/**
 * Plan cleanup candidates from in-memory deliverables + side tables.
 */
export function planStorageCleanup(input: {
  deliverables: StoredDeliverable[];
  nowMs?: number;
  tempTtlMs?: number;
  thumbnailTtlMs?: number;
}): CleanupCandidate[] {
  const now = input.nowMs ?? Date.now();
  const tempTtl = input.tempTtlMs ?? 30 * 60_000;
  const thumbTtl = input.thumbnailTtlMs ?? 24 * 60 * 60_000;
  const candidates: CleanupCandidate[] = [];
  const knownIds = new Set(input.deliverables.map((d) => d.id));

  for (const d of input.deliverables) {
    if (d.storageStatus === "failed") {
      candidates.push({
        kind: "failed_upload",
        artifactId: d.id,
        reason: "storage_status_failed",
      });
    }
    if (d.buffer.byteLength === 0) {
      candidates.push({
        kind: "zero_byte_failed",
        artifactId: d.id,
        reason: "zero_byte",
      });
    }
    if (d.storageStatus === "pending" && d.buffer.byteLength === 0) {
      candidates.push({
        kind: "partial_upload",
        artifactId: d.id,
        reason: "pending_empty",
      });
    }
  }

  for (const [id, meta] of getTempBucket()) {
    if (now - meta.createdAt > tempTtl) {
      candidates.push({
        kind: "temp",
        artifactId: id,
        reason: "temp_ttl_expired",
      });
    }
  }

  for (const [id, meta] of getThumbnailBucket()) {
    if (now - meta.createdAt > thumbTtl || !knownIds.has(id)) {
      candidates.push({
        kind: "orphan_thumbnail",
        artifactId: id,
        reason: knownIds.has(id) ? "thumbnail_ttl" : "orphan_thumbnail",
      });
    }
  }

  for (const [key, exp] of getExpiredUrlBucket()) {
    if (now > exp) {
      candidates.push({
        kind: "expired_url",
        artifactId: key,
        reason: "signed_url_expired",
      });
    }
  }

  // Orphan revision rows: version points to missing deliverable
  for (const d of input.deliverables) {
    const groupId = d.metadata?.versionGroupId;
    if (!groupId || typeof groupId !== "string") continue;
    const versions = listDeliverableVersions(groupId);
    for (const v of versions) {
      if (!knownIds.has(v.deliverableId)) {
        candidates.push({
          kind: "orphan_revision",
          artifactId: v.deliverableId,
          reason: `missing_binary_in_group_${groupId}`,
        });
      }
    }
  }

  return candidates;
}

/**
 * Execute cleanup — removes temp/thumbnail/expired URL tracking and soft-deletes artifacts.
 * Never hard-deletes ready non-zero binaries unless explicitly failed/temp.
 */
export function executeStorageCleanup(
  candidates: CleanupCandidate[],
  removeBinary?: (id: string) => void,
): CleanupReport {
  const deleted: string[] = [];
  const skipped: string[] = [];

  for (const c of candidates) {
    if (c.kind === "expired_url") {
      getExpiredUrlBucket().delete(c.artifactId);
      deleted.push(c.artifactId);
      continue;
    }
    if (c.kind === "orphan_thumbnail") {
      getThumbnailBucket().delete(c.artifactId);
      deleted.push(c.artifactId);
      continue;
    }
    if (c.kind === "temp") {
      getTempBucket().delete(c.artifactId);
      softDeleteArtifact(c.artifactId, c.reason);
      removeBinary?.(c.artifactId);
      deleted.push(c.artifactId);
      continue;
    }
    if (
      c.kind === "failed_upload" ||
      c.kind === "partial_upload" ||
      c.kind === "zero_byte_failed" ||
      c.kind === "orphan_revision"
    ) {
      softDeleteArtifact(c.artifactId, c.reason);
      removeBinary?.(c.artifactId);
      deleted.push(c.artifactId);
      continue;
    }
    skipped.push(c.artifactId);
  }

  return {
    scanned: candidates.length,
    deleted,
    skipped,
    candidates,
  };
}
