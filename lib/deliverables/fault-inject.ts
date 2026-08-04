/**
 * Test-only fault injection for Word Stage 3 resilience tests.
 * Never activates in production unless ATLAS_ALLOW_FAULT_INJECT=1 (dev/preview only).
 */

export type WordFaultKey =
  | "ai_content_timeout"
  | "ai_content_empty"
  | "docx_packer"
  | "docx_verify"
  | "storage_upload"
  | "storage_download"
  | "db_upsert"
  | "notification_send"
  | "sha256_mismatch_on_download"
  | "parallel_job_race";

type FaultBucket = Map<WordFaultKey, number>;

function getBucket(): FaultBucket {
  const scope = globalThis as typeof globalThis & {
    __atlasWordFaults?: FaultBucket;
  };
  if (!scope.__atlasWordFaults) {
    scope.__atlasWordFaults = new Map();
  }
  return scope.__atlasWordFaults;
}

export function faultInjectionAllowed(): boolean {
  if (process.env.NODE_ENV === "test" || process.env.VITEST === "true") {
    return true;
  }
  if (process.env.ATLAS_ALLOW_FAULT_INJECT === "1") {
    const vercel = process.env.VERCEL_ENV?.trim().toLowerCase();
    return vercel !== "production";
  }
  return false;
}

export function injectWordFault(key: WordFaultKey, times = 1): void {
  if (!faultInjectionAllowed()) return;
  const bucket = getBucket();
  bucket.set(key, (bucket.get(key) ?? 0) + Math.max(1, times));
}

export function clearWordFaults(): void {
  getBucket().clear();
}

export function shouldInjectWordFault(key: WordFaultKey): boolean {
  if (!faultInjectionAllowed()) return false;
  return (getBucket().get(key) ?? 0) > 0;
}

/** Consume-once fault (useful for single-failure-then-recover scenarios). */
export function consumeWordFault(key: WordFaultKey): boolean {
  if (!shouldInjectWordFault(key)) return false;
  const bucket = getBucket();
  const remaining = (bucket.get(key) ?? 0) - 1;
  if (remaining <= 0) bucket.delete(key);
  else bucket.set(key, remaining);
  return true;
}
