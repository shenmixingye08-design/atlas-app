import "server-only";

import { isInternalHealthProbeUserId } from "@/lib/health/internal-probe-user";
import { isAtlasProduction } from "@/lib/runtime/is-production";

import {
  clearClerkPrivateMetadataKeys,
  loadClerkPrivateMetadataKey,
} from "./clerk-private-metadata";
import { warnIfProductionSupabaseServiceRoleMissing } from "./production-guard";
import {
  loadSupabaseUserState,
  upsertSupabaseUserState,
} from "./supabase-user-state";

/**
 * Domains that MUST never write payloads (or routine pointers) to Clerk.
 * Source of truth: Supabase `atlas_user_state` only.
 * Old Clerk keys are cleared once (null) to shrink private_metadata under 8KB.
 */
export const SUPABASE_ONLY_DOMAIN_KEYS = [
  "atlasWorkJobs",
  "atlasNotifications",
  "atlasCommanderRuns",
  "atlasWorkMemory",
  "atlasLearning",
  "atlasPersonalMemory",
  "atlasMemoryApplyLog",
  "atlasWorkflowLearning",
  "atlasAutomations",
  "atlasHouseholdLedger",
  "atlasExternalAuth",
  "atlasAccountDeletion",
  "atlasVisionDiagnostics",
  "atlasPersistenceReport",
  "atlasErrorHistory",
  "atlasBilling",
  "atlasBillingUsage",
  /** P3-02: active company template tenant SoT */
  "atlasActiveCompany",
] as const;

export type SupabaseOnlyDomainKey = (typeof SUPABASE_ONLY_DOMAIN_KEYS)[number];

/** @deprecated Large domains never use Clerk byte budgets. */
export const CLERK_DOMAIN_SAFE_BYTES = 5500;

export type DurableDomainEnvelope<T> = {
  version: 1;
  updatedAt: string;
  storedInSupabase?: boolean;
  truncated?: boolean;
  payload?: T | null;
  id?: string | null;
};

export type PersistDurableDomainOptions<T> = {
  compact: (payload: T) => T;
  forceSupabase?: boolean;
  /** Ignored — supabase-only domains never write Clerk on persist. */
  skipClerkIfPointerCached?: boolean;
};

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function isSupabaseOnlyDomain(domainKey: string): boolean {
  return (SUPABASE_ONLY_DOMAIN_KEYS as readonly string[]).includes(domainKey);
}

function clearedUsersCache(): Set<string> {
  const g = globalThis as typeof globalThis & {
    __atlasClerkHeavyKeysCleared?: Set<string>;
  };
  if (!g.__atlasClerkHeavyKeysCleared) {
    g.__atlasClerkHeavyKeysCleared = new Set();
  }
  return g.__atlasClerkHeavyKeysCleared;
}

/** Test helper. */
export function resetClerkPointerCacheForTests(): void {
  clearedUsersCache().clear();
  const g = globalThis as typeof globalThis & {
    __atlasClerkPointerCache?: Set<string>;
  };
  g.__atlasClerkPointerCache?.clear();
}

/**
 * Migrate any leftover Clerk payloads → Supabase, then NULL those keys in Clerk.
 * Does not write new Clerk pointers (avoids 8KB / 429 on every job).
 */
export async function clearHeavyClerkDurableDomains(
  userId: string,
): Promise<{ migrated: string[]; cleared: string[] }> {
  if (isInternalHealthProbeUserId(userId)) {
    return { migrated: [], cleared: [] };
  }
  if (clearedUsersCache().has(userId)) {
    return { migrated: [], cleared: [] };
  }

  const migrated: string[] = [];
  const toClear: string[] = [];

  for (const domainKey of SUPABASE_ONLY_DOMAIN_KEYS) {
    const fromClerk =
      await loadClerkPrivateMetadataKey<DurableDomainEnvelope<unknown>>(
        userId,
        domainKey,
      );
    if (fromClerk == null) {
      // Still clear in batch in case of non-envelope garbage.
      toClear.push(domainKey);
      continue;
    }

    const hasHeavyPayload =
      fromClerk.payload !== undefined &&
      fromClerk.payload !== null &&
      !(
        typeof fromClerk.payload === "object" &&
        Object.keys(fromClerk.payload as object).length === 0
      );

    if (hasHeavyPayload) {
      const fromSb = await loadSupabaseUserState<DurableDomainEnvelope<unknown>>(
        userId,
        domainKey,
      );
      if (!fromSb?.payload) {
        const envelope: DurableDomainEnvelope<unknown> = {
          version: 1,
          updatedAt: fromClerk.updatedAt ?? new Date().toISOString(),
          storedInSupabase: true,
          id: domainKey,
          payload: fromClerk.payload,
        };
        const ok = await upsertSupabaseUserState(userId, domainKey, envelope);
        if (!ok) {
          console.error(
            `[persistence] Cannot clear Clerk ${domainKey}: Supabase migrate failed`,
          );
          continue;
        }
        migrated.push(domainKey);
      } else {
        migrated.push(domainKey);
      }
    }

    toClear.push(domainKey);
  }

  if (toClear.length > 0) {
    const ok = await clearClerkPrivateMetadataKeys(userId, toClear);
    if (ok) {
      clearedUsersCache().add(userId);
      return { migrated, cleared: toClear };
    }
    console.error(
      `[persistence] Failed to clear heavy Clerk keys for user=${userId}`,
    );
    return { migrated, cleared: [] };
  }

  clearedUsersCache().add(userId);
  return { migrated, cleared: [] };
}

/** @deprecated Use clearHeavyClerkDurableDomains — no longer writes pointers. */
export async function pruneOversizedClerkDurableDomains(
  userId: string,
): Promise<{ migrated: string[]; cleared: string[] }> {
  return clearHeavyClerkDurableDomains(userId);
}

/**
 * Durable write.
 * supabase-only / forceSupabase → Supabase ONLY (zero Clerk writes on persist).
 * Old oversized Clerk keys are cleared once per user (null), never re-filled.
 */
export async function persistDurableDomain<T>(
  userId: string,
  domainKey: string,
  payload: T,
  options: PersistDurableDomainOptions<T>,
): Promise<"clerk" | "supabase" | "clerk_compact" | "skipped"> {
  const updatedAt = new Date().toISOString();
  const full: DurableDomainEnvelope<T> = {
    version: 1,
    updatedAt,
    storedInSupabase: true,
    id: domainKey,
    payload,
  };

  const supabaseOnly =
    options.forceSupabase === true || isSupabaseOnlyDomain(domainKey);

  if (supabaseOnly) {
    // Shrink private_metadata once — migrate then null keys. No pointer rewrite.
    await clearHeavyClerkDurableDomains(userId);

    const supabaseOk = await upsertSupabaseUserState(userId, domainKey, full);
    if (!supabaseOk) {
      if (isAtlasProduction()) {
        warnIfProductionSupabaseServiceRoleMissing(`${domainKey} supabase-only`);
        console.error(
          `[persistence] Supabase-only persist failed for ${domainKey} ` +
            `(user=${userId}). Refusing any Clerk payload fallback.`,
        );
      }
      return "skipped";
    }
    return "supabase";
  }

  // Non-forced small settings may still use Clerk (connection prefs etc.).
  if (byteLength(full) <= CLERK_DOMAIN_SAFE_BYTES) {
    const { persistClerkPrivateMetadataKey } = await import(
      "./clerk-private-metadata"
    );
    const ok = await persistClerkPrivateMetadataKey(userId, domainKey, full);
    if (ok) return "clerk";
    const supabaseOk = await upsertSupabaseUserState(userId, domainKey, {
      ...full,
      storedInSupabase: true,
    });
    return supabaseOk ? "supabase" : "skipped";
  }

  const supabaseOk = await upsertSupabaseUserState(userId, domainKey, {
    ...full,
    storedInSupabase: true,
  });
  if (supabaseOk) return "supabase";

  if (isAtlasProduction()) {
    warnIfProductionSupabaseServiceRoleMissing(`${domainKey} overflow`);
    console.error(
      `[persistence] Production refuse Clerk fallback for ${domainKey} ` +
        `(user=${userId}).`,
    );
    return "skipped";
  }

  console.warn(
    `[persistence] Dev compact Clerk fallback for ${domainKey} (Supabase unavailable).`,
  );
  const { persistClerkPrivateMetadataKey } = await import(
    "./clerk-private-metadata"
  );
  const compactPayload = options.compact(payload);
  const ok = await persistClerkPrivateMetadataKey(userId, domainKey, {
    version: 1 as const,
    updatedAt,
    truncated: true,
    storedInSupabase: false,
    payload: compactPayload,
  });
  return ok ? "clerk_compact" : "skipped";
}

/** Load: Supabase first for supabase-only keys. Never depends on Clerk payloads. */
export async function loadDurableDomain<T>(
  userId: string,
  domainKey: string,
): Promise<T | null> {
  if (isSupabaseOnlyDomain(domainKey)) {
    const fromSb = await loadSupabaseUserState<DurableDomainEnvelope<T>>(
      userId,
      domainKey,
    );
    if (
      fromSb?.payload?.payload !== undefined &&
      fromSb.payload.payload !== null
    ) {
      return fromSb.payload.payload;
    }
    return null;
  }

  const fromClerk = await loadClerkPrivateMetadataKey<DurableDomainEnvelope<T>>(
    userId,
    domainKey,
  );

  if (fromClerk?.storedInSupabase) {
    const fromSb = await loadSupabaseUserState<DurableDomainEnvelope<T>>(
      userId,
      domainKey,
    );
    if (
      fromSb?.payload?.payload !== undefined &&
      fromSb.payload.payload !== null
    ) {
      return fromSb.payload.payload;
    }
  }

  if (fromClerk?.payload !== undefined && fromClerk.payload !== null) {
    return fromClerk.payload;
  }

  const fromSbOnly = await loadSupabaseUserState<DurableDomainEnvelope<T>>(
    userId,
    domainKey,
  );
  if (
    fromSbOnly?.payload?.payload !== undefined &&
    fromSbOnly.payload.payload !== null
  ) {
    return fromSbOnly.payload.payload;
  }

  return null;
}
