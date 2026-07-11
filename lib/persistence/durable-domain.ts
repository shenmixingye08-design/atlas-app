import "server-only";

import {
  loadClerkPrivateMetadataKey,
  persistClerkPrivateMetadataKey,
} from "./clerk-private-metadata";
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
};

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

/**
 * Clerk-first durable write.
 * Uses Supabase only when the full payload cannot fit Clerk privateMetadata.
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

  if (byteLength(full) <= CLERK_DOMAIN_SAFE_BYTES) {
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

  // Supabase unavailable — keep best-effort compact Clerk copy.
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
