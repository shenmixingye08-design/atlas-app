import "server-only";

import { isAtlasProduction } from "@/lib/runtime/is-production";

import {
  clearClerkPrivateMetadataKeys,
  loadClerkPrivateMetadataKey,
  persistClerkPrivateMetadataKey,
} from "./clerk-private-metadata";
import { warnIfProductionSupabaseServiceRoleMissing } from "./production-guard";
import {
  loadSupabaseUserState,
  upsertSupabaseUserState,
} from "./supabase-user-state";

/**
 * Domains that must never store payloads in Clerk private_metadata.
 * Durable source of truth is Supabase `atlas_user_state`.
 */
export const SUPABASE_ONLY_DOMAIN_KEYS = [
  "atlasWorkJobs",
  "atlasNotifications",
  "atlasCommanderRuns",
  "atlasWorkMemory",
  "atlasLearning",
  "atlasAutomations",
  "atlasHouseholdLedger",
  "atlasExternalAuth",
  "atlasAccountDeletion",
  "atlasVisionDiagnostics",
  "atlasPersistenceReport",
  "atlasErrorHistory",
  "atlasBilling",
  "atlasBillingUsage",
] as const;

export type SupabaseOnlyDomainKey = (typeof SUPABASE_ONLY_DOMAIN_KEYS)[number];

/** @deprecated Kept for tests — payloads no longer go to Clerk for large domains. */
export const CLERK_DOMAIN_SAFE_BYTES = 5500;

export type DurableDomainEnvelope<T> = {
  version: 1;
  updatedAt: string;
  storedInSupabase?: boolean;
  truncated?: boolean;
  /** Always null/omitted for supabase-only Clerk pointers. */
  payload?: T | null;
  /** Optional domain id for pointer debugging (never a payload). */
  id?: string | null;
};

export type PersistDurableDomainOptions<T> = {
  compact: (payload: T) => T;
  forceSupabase?: boolean;
  /**
   * When true (default for supabase-only), skip Clerk entirely if a pointer
   * was already ensured in this process — prevents 429 on repeated job saves.
   */
  skipClerkIfPointerCached?: boolean;
};

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function isSupabaseOnlyDomain(domainKey: string): boolean {
  return (SUPABASE_ONLY_DOMAIN_KEYS as readonly string[]).includes(domainKey);
}

/** Minimal Clerk pointer — never embeds job/history/deliverable JSON. */
function clerkSupabasePointer(
  updatedAt: string,
  domainKey: string,
): DurableDomainEnvelope<null> {
  return {
    version: 1,
    updatedAt,
    storedInSupabase: true,
    id: domainKey,
    payload: null,
  };
}

function pointerCacheKey(userId: string, domainKey: string): string {
  return `${userId}::${domainKey}`;
}

function getPointerCache(): Set<string> {
  const g = globalThis as typeof globalThis & {
    __atlasClerkPointerCache?: Set<string>;
  };
  if (!g.__atlasClerkPointerCache) g.__atlasClerkPointerCache = new Set();
  return g.__atlasClerkPointerCache;
}

/** Test helper. */
export function resetClerkPointerCacheForTests(): void {
  getPointerCache().clear();
}

async function ensureClerkPointerOnce(
  userId: string,
  domainKey: string,
  updatedAt: string,
): Promise<void> {
  const cache = getPointerCache();
  const key = pointerCacheKey(userId, domainKey);
  if (cache.has(key)) return;

  const ok = await persistClerkPrivateMetadataKey(
    userId,
    domainKey,
    clerkSupabasePointer(updatedAt, domainKey),
  );
  if (ok) {
    cache.add(key);
    return;
  }

  // One prune + one retry — never loop.
  await pruneOversizedClerkDurableDomains(userId);
  const retryOk = await persistClerkPrivateMetadataKey(
    userId,
    domainKey,
    clerkSupabasePointer(updatedAt, domainKey),
  );
  if (retryOk) cache.add(key);
}

/**
 * Durable write.
 * supabase-only / forceSupabase → Supabase full blob; Clerk pointer at most once per process.
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
    payload,
  };

  const supabaseOnly =
    options.forceSupabase === true || isSupabaseOnlyDomain(domainKey);

  if (supabaseOnly) {
    const supabaseOk = await upsertSupabaseUserState(userId, domainKey, full);
    if (!supabaseOk) {
      if (isAtlasProduction()) {
        warnIfProductionSupabaseServiceRoleMissing(`${domainKey} supabase-only`);
        console.error(
          `[persistence] Supabase-only persist failed for ${domainKey} ` +
            `(user=${userId}). Refusing Clerk payload fallback.`,
        );
      }
      return "skipped";
    }

    const skipClerk = options.skipClerkIfPointerCached !== false;
    if (skipClerk) {
      await ensureClerkPointerOnce(userId, domainKey, updatedAt);
    }
    return "supabase";
  }

  if (byteLength(full) <= CLERK_DOMAIN_SAFE_BYTES) {
    const ok = await persistClerkPrivateMetadataKey(userId, domainKey, full);
    if (ok) return "clerk";
    const supabaseOk = await upsertSupabaseUserState(userId, domainKey, {
      ...full,
      storedInSupabase: true,
    });
    if (supabaseOk) {
      await ensureClerkPointerOnce(userId, domainKey, updatedAt);
      return "supabase";
    }
    return "skipped";
  }

  const supabaseOk = await upsertSupabaseUserState(userId, domainKey, {
    ...full,
    storedInSupabase: true,
  });
  if (supabaseOk) {
    await ensureClerkPointerOnce(userId, domainKey, updatedAt);
    return "supabase";
  }

  if (isAtlasProduction()) {
    warnIfProductionSupabaseServiceRoleMissing(`${domainKey} overflow`);
    console.error(
      `[persistence] Production refuse truncated Clerk fallback for ${domainKey} ` +
        `(user=${userId}). Full payload was not durable-saved.`,
    );
    return "skipped";
  }

  console.warn(
    `[persistence] Dev compact Clerk fallback for ${domainKey} (Supabase overflow unavailable).`,
  );
  const compactPayload = options.compact(payload);
  const compactEnvelope: DurableDomainEnvelope<T> = {
    version: 1,
    updatedAt,
    truncated: true,
    storedInSupabase: false,
    payload: compactPayload,
  };
  const ok = await persistClerkPrivateMetadataKey(
    userId,
    domainKey,
    compactEnvelope,
  );
  return ok ? "clerk_compact" : "skipped";
}

/**
 * Migrate leftover Clerk payloads into Supabase, then clear those keys from Clerk.
 * Called only on 8KB errors — never on every job save.
 */
export async function pruneOversizedClerkDurableDomains(
  userId: string,
): Promise<{ migrated: string[]; cleared: string[] }> {
  const migrated: string[] = [];
  const toClear: string[] = [];

  for (const domainKey of SUPABASE_ONLY_DOMAIN_KEYS) {
    const fromClerk = await loadClerkPrivateMetadataKey<DurableDomainEnvelope<unknown>>(
      userId,
      domainKey,
    );
    if (!fromClerk) continue;

    const hasHeavyPayload =
      fromClerk.payload !== undefined &&
      fromClerk.payload !== null &&
      !(
        fromClerk.storedInSupabase === true &&
        (fromClerk.payload === null ||
          (typeof fromClerk.payload === "object" &&
            Object.keys(fromClerk.payload as object).length === 0))
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
          payload: fromClerk.payload,
        };
        const ok = await upsertSupabaseUserState(userId, domainKey, envelope);
        if (!ok) {
          console.error(
            `[persistence] Cannot prune Clerk ${domainKey}: Supabase migrate failed`,
          );
          continue;
        }
        migrated.push(domainKey);
      } else {
        migrated.push(domainKey);
      }
    }

    // Clear heavy key from Clerk (null) — pointer optional later via ensureClerkPointerOnce.
    toClear.push(domainKey);
    getPointerCache().delete(pointerCacheKey(userId, domainKey));
  }

  if (toClear.length > 0) {
    const clearedOk = await clearClerkPrivateMetadataKeys(userId, toClear);
    if (clearedOk) {
      return { migrated, cleared: toClear };
    }
  }

  return { migrated, cleared: [] };
}

/** Load domain: Supabase first for supabase-only keys; Clerk pointer is advisory. */
export async function loadDurableDomain<T>(
  userId: string,
  domainKey: string,
): Promise<T | null> {
  if (isSupabaseOnlyDomain(domainKey)) {
    const fromSb = await loadSupabaseUserState<DurableDomainEnvelope<T>>(
      userId,
      domainKey,
    );
    if (fromSb?.payload?.payload !== undefined && fromSb.payload.payload !== null) {
      return fromSb.payload.payload;
    }
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
    if (fromSb?.payload?.payload !== undefined && fromSb.payload.payload !== null) {
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
