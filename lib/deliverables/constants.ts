/** Private Supabase Storage bucket for deliverable binaries (Word/PDF/etc). */
export const ATLAS_DELIVERABLE_FILES_BUCKET = "atlas-deliverable-files";

/** Process-memory cache TTL — does NOT expire the deliverable itself. */
export const DELIVERABLE_MEMORY_TTL_MS = 1000 * 60 * 60; // 1 hour

/**
 * Metadata / durable row TTL.
 * Extended from 1h so Word downloads remain available across sessions.
 */
export const DELIVERABLE_METADATA_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

/**
 * Back-compat alias used by older callers/tests.
 * Memory purge continues to use the short cache window via DELIVERABLE_MEMORY_TTL_MS.
 */
export const DELIVERABLE_TTL_MS = DELIVERABLE_METADATA_TTL_MS;

/** Prefer regenerating over embedding huge base64 blobs in Postgres. */
export const MAX_BASE64_CACHE_BYTES = 512 * 1024; // 512KB

/** Soft cap for Storage object size diagnostics. */
export const MAX_DELIVERABLE_STORAGE_BYTES = 25 * 1024 * 1024;

/** AI content quality: minimum meaningful body length before Word conversion. */
export const WORD_CONTENT_MIN_CHARS = 80;

/** Max AI content regeneration attempts before failing the Word job. */
export const WORD_CONTENT_MAX_RETRIES = 3;

export type DeliverableStorageStatus =
  | "pending"
  | "stored"
  | "failed"
  | "regenerated"
  | "missing"
  | "legacy_base64";

export type DeliverableDeletionReason =
  | "user"
  | "admin"
  | "contract"
  | "expired"
  | null;

export type DeliverableAvailability =
  | "downloadable"
  | "regenerating"
  | "regeneratable"
  | "expired"
  | "deleted"
  | "recovery_failed";
