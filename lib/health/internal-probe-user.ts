/**
 * Identifies internal health/test/probe identities that are never Clerk users.
 *
 * Generation and classification share this module so health probes and tick
 * persistence cannot drift into per-route string-hack checks.
 */

import { randomUUID } from "crypto";

import { safeLog } from "@/lib/security/redact";

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

export type InternalProbeClassification =
  | {
      isProbe: true;
      probeType: string;
      skipReason: string;
    }
  | { isProbe: false };

/**
 * Meaning-based probe identity:
 * - generated n0X health probes (`n08_probe_*`, `n07_user_*`)
 * - memory/company-template probes (`user_n05_mem_*`, `user_p302_probe_*`)
 * - ops sentinels (`__atlas_*`)
 *
 * Real Clerk ids (`user_2…`) are never classified as probes.
 */
export function classifyInternalProbeIdentity(
  userId: string | null | undefined,
): InternalProbeClassification {
  const id = userId?.trim() ?? "";
  if (!id) return { isProbe: false };

  if ((INTERNAL_HEALTH_PROBE_EXACT_IDS as readonly string[]).includes(id)) {
    return {
      isProbe: true,
      probeType: "sentinel",
      skipReason: "exact_internal_sentinel",
    };
  }

  if (id.startsWith("__atlas_")) {
    return {
      isProbe: true,
      probeType: "ops_sentinel",
      skipReason: "atlas_ops_sentinel_prefix",
    };
  }

  for (const prefix of INTERNAL_HEALTH_PROBE_ID_PREFIXES) {
    if (id.startsWith(prefix)) {
      return {
        isProbe: true,
        probeType: prefix.replace(/_$/, ""),
        skipReason: "health_probe_prefix",
      };
    }
  }

  // n07_user_a_* / n04_user_* — probe owners, never Clerk `user_*` ids.
  const numberedUser = id.match(/^(n0\d+)_user_/);
  if (numberedUser) {
    return {
      isProbe: true,
      probeType: `${numberedUser[1]}_soft_success_probe`,
      skipReason: "numbered_probe_user_owner",
    };
  }

  const numberedProbe = id.match(/^(n0\d+)_probe_/);
  if (numberedProbe) {
    return {
      isProbe: true,
      probeType: `${numberedProbe[1]}_health_probe`,
      skipReason: "numbered_probe_prefix",
    };
  }

  // user_n05_mem_* — memory-apply probe (not Clerk user_2…).
  const memoryProbe = id.match(/^user_(n0\d+)_/);
  if (memoryProbe) {
    return {
      isProbe: true,
      probeType: `${memoryProbe[1]}_memory_probe`,
      skipReason: "numbered_memory_probe_user",
    };
  }

  // user_p302_probe_* / user_p301_probe_* — product-phase probes.
  const phaseProbe = id.match(/^user_p(\d+)_probe_/);
  if (phaseProbe) {
    return {
      isProbe: true,
      probeType: `p${phaseProbe[1]}_probe`,
      skipReason: "product_phase_probe_user",
    };
  }

  return { isProbe: false };
}

export function isInternalProbeUser(
  userId: string | null | undefined,
): boolean {
  return classifyInternalProbeIdentity(userId).isProbe;
}

/** @deprecated Use isInternalProbeUser — kept as the historical export. */
export const isInternalHealthProbeUserId = isInternalProbeUser;

export function createN08ProbeOwnerIds(): { ownerA: string; ownerB: string } {
  return {
    ownerA: `n08_probe_a_${randomUUID().slice(0, 8)}`,
    ownerB: `n08_probe_b_${randomUUID().slice(0, 8)}`,
  };
}

export function skipClerkRemoteForInternalProbe(input: {
  userId: string | null | undefined;
  route: string;
  operation: string;
}): boolean {
  const classified = classifyInternalProbeIdentity(input.userId);
  if (!classified.isProbe) return false;
  safeLog("info", "INTERNAL_PROBE_REMOTE_CALL_SKIPPED", {
    route: input.route,
    operation: input.operation,
    probeType: classified.probeType,
    skipReason: classified.skipReason,
  });
  return true;
}
