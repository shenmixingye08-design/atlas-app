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
 * Clerk 8KB total limit — only lightweight settings / connection pointers belong there.
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
] as const;

export type SupabaseOnlyDomainKey = (typeof SUPABASE_ONLY_DOMAIN_KEYS)[number];

/**
 * @deprecated Clerk no longer accepts domain payloads for large data.
 * Kept for test compatibility — pointer-only writes use a tiny envelope.
 */
export const CLERK_DOMAIN_SAFE_BYTES = 5500;

export type DurableDomainEnvelope<T> = {
  version: 1;
  updatedAt: string;
  /** When true, full payload lives in Supabase `atlas_user_state`. */
  storedInSupabase?: boolean;
  truncated?: boolean;
  /** Omitted or null for supabase-only domains (Clerk pointer). */
  payload?: T | null;
};

export type PersistDurableDomainOptions<T> = {
  /**
   * @deprecated Compaction for Clerk is no longer used for large domains.
   * Kept so existing callers compile; ignored when forceSupabase / supabase-only.
   */
  compact: (payload: T) => T;
  /** Always store the full payload in Supabase (required for job/history domains). */
  forceSupabase?: boolean;
};

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function isSupabaseOnlyDomain(domainKey: string): boolean {
  return (SUPABASE_ONLY_DOMAIN_KEYS as readonly string[]).includes(domainKey);
}

/** Tiny Clerk pointer — never embeds job/history/deliverable payloads. */
function clerkSupabasePointer(updatedAt: string): DurableDomainEnvelope<null> {
  return {
    version: 1,
    updatedAt,
    storedInSupabase: true,
    payload: null,
  };
}

/**
 * Durable write.
 * Large / forceSupabase domains → Supabase only + optional Clerk pointer (no payload).
 * Small non-forced domains may still use Clerk when they fit safely.
 *
 * Truncating payloads into Clerk is forbidden for production durability.
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

    // Pointer only — never write job/history JSON into Clerk.
    const pointerOk = await persistClerkPrivateMetadataKey(
      userId,
      domainKey,
      clerkSupabasePointer(updatedAt),
    );
    if (!pointerOk) {
      // Data is durable in Supabase; attempt overflow prune then pointer retry.
      await pruneOversizedClerkDurableDomains(userId);
      await persistClerkPrivateMetadataKey(
        userId,
        domainKey,
        clerkSupabasePointer(updatedAt),
      );
    }
    return "supabase";
  }

  if (byteLength(full) <= CLERK_DOMAIN_SAFE_BYTES) {
    const ok = await persistClerkPrivateMetadataKey(userId, domainKey, full);
    if (ok) return "clerk";
    // Clerk rejected (often 8KB total). Migrate this key to Supabase rather than truncate.
    const supabaseOk = await upsertSupabaseUserState(userId, domainKey, full);
    if (supabaseOk) {
      await pruneOversizedClerkDurableDomains(userId);
      await persistClerkPrivateMetadataKey(
        userId,
        domainKey,
        clerkSupabasePointer(updatedAt),
      );
      return "supabase";
    }
    return "skipped";
  }

  // Oversized non-forced domain — full blob to Supabase, pointer in Clerk.
  const supabaseOk = await upsertSupabaseUserState(userId, domainKey, full);
  if (supabaseOk) {
    await persistClerkPrivateMetadataKey(
      userId,
      domainKey,
      clerkSupabasePointer(updatedAt),
    );
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

  // Development only — compact Clerk is last resort and never treated as production success.
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
 * Migrate known large Clerk domain blobs into Supabase and replace Clerk values
 * with pointers so private_metadata fits under 8KB. Does not discard data.
 */
export async function pruneOversizedClerkDurableDomains(
  userId: string,
): Promise<{ migrated: string[]; cleared: string[] }> {
  const migrated: string[] = [];
  const cleared: string[] = [];

  for (const domainKey of SUPABASE_ONLY_DOMAIN_KEYS) {
    const fromClerk = await loadClerkPrivateMetadataKey<DurableDomainEnvelope<unknown>>(
      userId,
      domainKey,
    );
    if (!fromClerk) continue;

    const hasPayload =
      fromClerk.payload !== undefined &&
      fromClerk.payload !== null &&
      !(
        typeof fromClerk.payload === "object" &&
        fromClerk.payload !== null &&
        Object.keys(fromClerk.payload as object).length === 0 &&
        fromClerk.storedInSupabase
      );

    if (hasPayload && fromClerk.storedInSupabase !== true) {
      const envelope: DurableDomainEnvelope<unknown> = {
        version: 1,
        updatedAt: fromClerk.updatedAt ?? new Date().toISOString(),
        payload: fromClerk.payload,
        storedInSupabase: true,
      };
      const ok = await upsertSupabaseUserState(userId, domainKey, envelope);
      if (ok) {
        migrated.push(domainKey);
      } else {
        console.error(
          `[persistence] Cannot prune Clerk ${domainKey}: Supabase migrate failed`,
        );
        continue;
      }
    } else if (hasPayload && fromClerk.storedInSupabase === true) {
      // Compact leftover in Clerk while full copy should already be in Supabase —
      // verify Supabase has data before clearing Clerk payload.
      const fromSb = await loadSupabaseUserState<DurableDomainEnvelope<unknown>>(
        userId,
        domainKey,
      );
      if (!fromSb?.payload) {
        const envelope: DurableDomainEnvelope<unknown> = {
          version: 1,
          updatedAt: fromClerk.updatedAt ?? new Date().toISOString(),
          payload: fromClerk.payload,
          storedInSupabase: true,
        };
        const ok = await upsertSupabaseUserState(userId, domainKey, envelope);
        if (!ok) {
          console.error(
            `[persistence] Cannot prune Clerk ${domainKey}: Supabase missing and migrate failed`,
          );
          continue;
        }
        migrated.push(domainKey);
      }
    }

    const pointerOk = await persistClerkPrivateMetadataKey(
      userId,
      domainKey,
      clerkSupabasePointer(new Date().toISOString()),
    );
    if (pointerOk) cleared.push(domainKey);
  }

  // Drop any residual non-pointer large keys that failed pointer write by clearing.
  const stillHeavy = SUPABASE_ONLY_DOMAIN_KEYS.filter(
    (key) => !cleared.includes(key),
  );
  if (stillHeavy.length > 0) {
    // Only clear keys we successfully migrated or that are already pointer/supabase-backed.
    const safeToClear = stillHeavy.filter((key) => migrated.includes(key));
    if (safeToClear.length > 0) {
      await clearClerkPrivateMetadataKeys(userId, safeToClear);
      cleared.push(...safeToClear);
    }
  }

  return { migrated, cleared };
}

/** Load domain state: prefer Supabase full blob when Clerk marks overflow / pointer. */
export async function loadDurableDomain<T>(
  userId: string,
  domainKey: string,
): Promise<T | null> {
  const fromClerk = await loadClerkPrivateMetadataKey<DurableDomainEnvelope<T>>(
    userId,
    domainKey,
  );

  if (fromClerk?.storedInSupabase || isSupabaseOnlyDomain(domainKey)) {
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
