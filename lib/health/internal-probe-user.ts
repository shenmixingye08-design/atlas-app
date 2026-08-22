/**
 * Identifies internal health-probe identities that are never Clerk users.
 *
 * Generation and classification share this module so `/api/health/n08-*`
 * (and siblings) cannot drift into a string-hack-only check.
 */

import { randomUUID } from "crypto";

/** Prefixes emitted by production health probes (not Clerk user ids). */
export const INTERNAL_HEALTH_PROBE_ID_PREFIXES = [
  "n08_probe_",
  "n07_probe_",
  "n04_probe_",
  "n05_probe_",
  "n03_probe_",
] as const;

/**
 * Sentinel ids used by schema/ops probes. These are never Clerk users —
 * remote getUser / updateUserMetadata / deleteUser yields 404/429 noise.
 */
export const INTERNAL_HEALTH_PROBE_EXACT_IDS = [
  "__atlas_billing_schema_probe__",
  "__atlas_worker_scale_probe__",
  "__atlas_structured_logs_probe_a__",
  "__atlas_structured_logs_probe_b__",
  "__atlas_reliability_probe__",
  "__atlas_ocr_engine_probe__",
  "__atlas_ocr_engine_probe_b__",
  "__atlas_p102_probe__",
  "__atlas_prod_schema_probe__",
  "__atlas_health_probe__",
  "__atlas_health_probe_repo__",
  "user_p301_probe_a",
  "user_p301_probe_b",
] as const;

export function createN08ProbeOwnerIds(): { ownerA: string; ownerB: string } {
  return {
    ownerA: `n08_probe_a_${randomUUID().slice(0, 8)}`,
    ownerB: `n08_probe_b_${randomUUID().slice(0, 8)}`,
  };
}

export function isInternalHealthProbeUserId(
  userId: string | null | undefined,
): boolean {
  const id = userId?.trim() ?? "";
  if (!id) return false;
  if ((INTERNAL_HEALTH_PROBE_EXACT_IDS as readonly string[]).includes(id)) {
    return true;
  }
  for (const prefix of INTERNAL_HEALTH_PROBE_ID_PREFIXES) {
    if (id.startsWith(prefix)) return true;
  }
  // Ops sentinels (`__atlas_*`) are process/DB keys, never Clerk users.
  if (id.startsWith("__atlas_")) return true;
  return false;
}
