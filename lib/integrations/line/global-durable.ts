import "server-only";

import {
  loadSupabaseUserState,
  upsertSupabaseUserState,
} from "@/lib/persistence/supabase-user-state";

import type { LineLinkCode, LineUserLink } from "./link-store";

/** Synthetic user_id for global LINE index (codes / reverse links / webhook ids). */
export const LINE_GLOBAL_USER_ID = "__atlas_line__";
export const LINE_GLOBAL_DOMAIN_KEY = "atlasLineGlobal";

export type DurableLineGlobalState = {
  links: LineUserLink[];
  codes: LineLinkCode[];
  processedEventIds: Array<{ id: string; at: number }>;
  digestClaims: string[];
};

const MAX_PROCESSED_EVENTS = 500;
const MAX_DIGEST_CLAIMS = 400;
const EVENT_TTL_MS = 1000 * 60 * 60 * 48;

function emptyState(): DurableLineGlobalState {
  return {
    links: [],
    codes: [],
    processedEventIds: [],
    digestClaims: [],
  };
}

let memoryCache: DurableLineGlobalState | null = null;
let hydratePromise: Promise<void> | null = null;

function getCache(): DurableLineGlobalState {
  if (!memoryCache) memoryCache = emptyState();
  return memoryCache;
}

function prune(state: DurableLineGlobalState, now = Date.now()): DurableLineGlobalState {
  return {
    links: state.links,
    codes: state.codes.filter((entry) => entry.expiresAt > now),
    processedEventIds: state.processedEventIds
      .filter((entry) => now - entry.at < EVENT_TTL_MS)
      .slice(-MAX_PROCESSED_EVENTS),
    digestClaims: state.digestClaims.slice(-MAX_DIGEST_CLAIMS),
  };
}

async function persistGlobal(state: DurableLineGlobalState): Promise<void> {
  const next = prune(state);
  memoryCache = next;
  await upsertSupabaseUserState(LINE_GLOBAL_USER_ID, LINE_GLOBAL_DOMAIN_KEY, {
    version: 1,
    updatedAt: new Date().toISOString(),
    payload: next,
  });
}

export async function ensureLineGlobalHydrated(): Promise<DurableLineGlobalState> {
  if (memoryCache) return memoryCache;
  if (hydratePromise) {
    await hydratePromise;
    return getCache();
  }

  hydratePromise = (async () => {
    const loaded = await loadSupabaseUserState<{
      version?: number;
      updatedAt?: string;
      payload?: DurableLineGlobalState;
    }>(LINE_GLOBAL_USER_ID, LINE_GLOBAL_DOMAIN_KEY);

    const envelope = loaded?.payload;
    const payload =
      envelope &&
      typeof envelope === "object" &&
      "payload" in envelope &&
      (envelope as { payload?: DurableLineGlobalState }).payload
        ? (envelope as { payload: DurableLineGlobalState }).payload
        : (envelope as DurableLineGlobalState | undefined);

    if (payload && typeof payload === "object") {
      memoryCache = prune({
        links: Array.isArray(payload.links) ? payload.links : [],
        codes: Array.isArray(payload.codes) ? payload.codes : [],
        processedEventIds: Array.isArray(payload.processedEventIds)
          ? payload.processedEventIds
          : [],
        digestClaims: Array.isArray(payload.digestClaims)
          ? payload.digestClaims
          : [],
      });
    } else {
      memoryCache = emptyState();
    }
  })();

  try {
    await hydratePromise;
  } finally {
    hydratePromise = null;
  }
  return getCache();
}

export async function upsertLineGlobalLink(link: LineUserLink): Promise<void> {
  const cache = await ensureLineGlobalHydrated();
  cache.links = cache.links.filter(
    (row) =>
      row.atlasUserId !== link.atlasUserId && row.lineUserId !== link.lineUserId,
  );
  cache.links.push(link);
  await persistGlobal(cache);
}

export async function removeLineGlobalLink(atlasUserId: string): Promise<void> {
  const cache = await ensureLineGlobalHydrated();
  cache.links = cache.links.filter((row) => row.atlasUserId !== atlasUserId);
  await persistGlobal(cache);
}

export async function upsertLineGlobalCode(entry: LineLinkCode): Promise<void> {
  const cache = await ensureLineGlobalHydrated();
  cache.codes = cache.codes.filter(
    (row) => row.code !== entry.code && row.atlasUserId !== entry.atlasUserId,
  );
  cache.codes.push(entry);
  await persistGlobal(cache);
}

export async function removeLineGlobalCode(code: string): Promise<void> {
  const cache = await ensureLineGlobalHydrated();
  cache.codes = cache.codes.filter((row) => row.code !== code);
  await persistGlobal(cache);
}

export async function claimLineWebhookEventId(
  eventId: string | undefined | null,
): Promise<boolean> {
  if (!eventId) return true;
  const cache = await ensureLineGlobalHydrated();
  if (cache.processedEventIds.some((entry) => entry.id === eventId)) {
    return false;
  }
  cache.processedEventIds.push({ id: eventId, at: Date.now() });
  await persistGlobal(cache);
  return true;
}

export async function claimDurableDailyDigest(
  userId: string,
  kind: string,
  day: string,
): Promise<boolean> {
  const key = `${userId}:${kind}:${day}`;
  const cache = await ensureLineGlobalHydrated();
  if (cache.digestClaims.includes(key)) return false;
  cache.digestClaims.push(key);
  await persistGlobal(cache);
  return true;
}

export function resetLineGlobalDurableForTests(): void {
  memoryCache = null;
  hydratePromise = null;
}
