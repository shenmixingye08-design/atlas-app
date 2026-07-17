import "server-only";

import { isAtlasProduction } from "@/lib/runtime/is-production";

import {
  loadClerkPrivateMetadataKey,
  persistClerkPrivateMetadataKey,
} from "./clerk-private-metadata";
import { warnIfProductionSupabaseServiceRoleMissing } from "./production-guard";
import {
  loadSupabaseUserState,
  upsertSupabaseUserState,
} from "./supabase-user-state";

/**
 * Leave headroom for billing + commander sibling keys in Clerk privateMetadata (~8KB).
 */
export const CLERK_DOMAIN_SAFE_BYTES = 5500;

export type DurableDomainEnvelope<T> = {
  version: 1;
  updatedAt: string;
  /** When true, full payload lives in Supabase `atlas_user_state`. */
  storedInSupabase?: boolean;
  truncated?: boolean;
  payload: T;
};

export type PersistDurableDomainOptions<T> = {
  /** Shrink payload until it fits Clerk; used when full JSON exceeds safe bytes. */
  compact: (payload: T) => T;
   /** Always store the full payload in Supabase, regardless of its byte size. */
  forceSupabase?: boolean;
};

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

/**
 * Clerk-first durable write.
 * Uses Supabase only when the full payload cannot fit Clerk privateMetadata.
 *
 * In production, truncated Clerk-only fallback is not treated as success when
 * Supabase overflow write fails — returns `"skipped"` instead of `"clerk_compact"`.
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

if (
  !options.forceSupabase &&
  byteLength(full) <= CLERK_DOMAIN_SAFE_BYTES
) {
    const ok = await persistClerkPrivateMetadataKey(userId, domainKey, full);
    return ok ? "clerk" : "skipped";
  }

  const compactPayload = options.compact(payload);
  const compactEnvelope: DurableDomainEnvelope<T> = {
    version: 1,
    updatedAt,
    truncated: true,
    storedInSupabase: true,
    payload: compactPayload,
  };

  const supabaseOk = await upsertSupabaseUserState(userId, domainKey, full);
  if (supabaseOk) {
    await persistClerkPrivateMetadataKey(userId, domainKey, compactEnvelope);
    return "supabase";
  }

  // Supabase unavailable for overflow.
  if (isAtlasProduction()) {
    warnIfProductionSupabaseServiceRoleMissing(`${domainKey} overflow`);
    console.error(
      `[persistence] Production refuse truncated Clerk fallback for ${domainKey} ` +
        `(user=${userId}). Full payload was not durable-saved.`,
    );
    return "skipped";
  }

  // Development only — keep best-effort compact Clerk copy.
  console.warn(
    `[persistence] Dev compact Clerk fallback for ${domainKey} (Supabase overflow unavailable).`,
  );
  compactEnvelope.storedInSupabase = false;
  const ok = await persistClerkPrivateMetadataKey(
    userId,
    domainKey,
    compactEnvelope,
  );
  return ok ? "clerk_compact" : "skipped";
}

/** Load domain state: prefer Supabase full blob when Clerk marks overflow. */
export async function loadDurableDomain<T>(
  userId: string,
  domainKey: string,
): Promise<T | null> {
  const fromClerk = await loadClerkPrivateMetadataKey<DurableDomainEnvelope<T>>(
    userId,
    domainKey,
  );

  if (fromClerk?.storedInSupabase) {
    const fromSb = await loadSupabaseUserState<DurableDomainEnvelope<T>>(
      userId,
      domainKey,
    );
    if (fromSb?.payload?.payload !== undefined) {
      return fromSb.payload.payload;
    }
  }

  if (fromClerk?.payload !== undefined) {
    return fromClerk.payload;
  }

  const fromSbOnly = await loadSupabaseUserState<DurableDomainEnvelope<T>>(
    userId,
    domainKey,
  );
  if (fromSbOnly?.payload?.payload !== undefined) {
    return fromSbOnly.payload.payload;
  }

  return null;
}
