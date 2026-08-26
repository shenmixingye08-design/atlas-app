/**
 * Identifies internal health-probe identities that are never Clerk users
 * and must never consume real-user plan quota or remote APIs.
 *
 * Generation and classification share this module so health routes cannot
 * drift into per-route string-hack prefix checks.
 */

import { randomUUID } from "crypto";

/**
 * Prefixes emitted by production health probes (not Clerk user ids).
 * Keep this list complete — route-local prefix checks are forbidden.
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
  "__atlas_billing_usage__",
  "__atlas_usage_rpc_probe__",
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

export function createN05MemoryProbeOwnerIds(): {
  ownerA: string;
  ownerB: string;
} {
  const runId = randomUUID().slice(0, 8);
  return {
    ownerA: `user_n05_mem_a_${runId}`,
    ownerB: `user_n05_mem_b_${runId}`,
  };
}

export function createN07ProbeOwnerIds(): { ownerA: string; ownerB: string } {
  return {
    ownerA: `n07_user_a_${randomUUID().slice(0, 8)}`,
    ownerB: `n07_user_b_${randomUUID().slice(0, 8)}`,
  };
}

/**
 * True when `userId` is an internal health-probe identity.
 * Preferred name: {@link isInternalProbeIdentity}.
 */
export function isInternalHealthProbeUserId(
  userId: string | null | undefined,
): boolean {
  return isInternalProbeIdentity(userId);
}

/**
 * Shared classifier for all internal probe identities.
 * Probe identities must not call Clerk, notification remote APIs,
 * or consume real-user plan quota.
 */
export function isInternalProbeIdentity(
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
