/**
 * Identifies internal health-probe identities that are never Clerk users.
 *
 * Generation and classification share this module so health probes cannot
 * drift into a string-hack-only check scattered across routes.
 */

import { randomUUID } from "crypto";

/**
 * Prefixes emitted by production health probes (not Clerk user ids).
 * Clerk customer ids look like `user_2abc…` and must stay unclassified.
 */
export const INTERNAL_HEALTH_PROBE_ID_PREFIXES = [
  "n08_probe_",
  "n07_probe_",
  "n07_user_",
  "n04_probe_",
  "n05_probe_",
  "user_n05_mem_",
  "n03_probe_",
  "user_p302_probe_",
  "user_p301_probe_",
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
  "user_p302_probe_a",
  "user_p302_probe_b",
] as const;

export function createN08ProbeOwnerIds(): { ownerA: string; ownerB: string } {
  return {
    ownerA: `n08_probe_a_${randomUUID().slice(0, 8)}`,
    ownerB: `n08_probe_b_${randomUUID().slice(0, 8)}`,
  };
}

/** N-05 memory-apply health identities. Never persist to Clerk. */
export function createN05MemoryProbeUserIds(runId = randomUUID().slice(0, 8)): {
  probeUserA: string;
  probeUserB: string;
  runId: string;
} {
  return {
    probeUserA: `user_n05_mem_a_${runId}`,
    probeUserB: `user_n05_mem_b_${runId}`,
    runId,
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

/** Meaning-based alias used by persistence and health probes. */
export function isInternalProbeIdentity(
  userId: string | null | undefined,
): boolean {
  return isInternalHealthProbeUserId(userId);
}
