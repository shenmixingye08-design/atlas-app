import "server-only";

import {
  loadSupabaseUserState,
  listSupabaseUserIdsForDomain,
  upsertSupabaseUserState,
} from "@/lib/persistence/supabase-user-state";

/** Per-user durable domain key (Clerk privateMetadata / Supabase atlas_user_state). */
export const AUTOMATIONS_DOMAIN_KEY = "atlasAutomations";

/** Synthetic user_id for global automation tick index + claims. */
export const AUTOMATIONS_GLOBAL_USER_ID = "__atlas_automations__";
export const AUTOMATIONS_GLOBAL_DOMAIN_KEY = "atlasAutomationsGlobal";

export type DurableAutomationsGlobalState = {
  userIds: string[];
  tickClaims: Array<{ key: string; at: number }>;
};

const MAX_TICK_CLAIMS = 800;
const TICK_CLAIM_TTL_MS = 1000 * 60 * 60 * 24;

function emptyState(): DurableAutomationsGlobalState {
  return { userIds: [], tickClaims: [] };
}

let memoryCache: DurableAutomationsGlobalState | null = null;
let hydratePromise: Promise<void> | null = null;

function getCache(): DurableAutomationsGlobalState {
  if (!memoryCache) memoryCache = emptyState();
  return memoryCache;
}

function prune(
  state: DurableAutomationsGlobalState,
  now = Date.now(),
): DurableAutomationsGlobalState {
  return {
    userIds: [...new Set(state.userIds.filter((id) => id.trim().length > 0))],
    tickClaims: state.tickClaims
      .filter((entry) => now - entry.at < TICK_CLAIM_TTL_MS)
      .slice(-MAX_TICK_CLAIMS),
  };
}

async function persistGlobal(
  state: DurableAutomationsGlobalState,
): Promise<void> {
  const next = prune(state);
  memoryCache = next;
  await upsertSupabaseUserState(
    AUTOMATIONS_GLOBAL_USER_ID,
    AUTOMATIONS_GLOBAL_DOMAIN_KEY,
    {
      version: 1,
      updatedAt: new Date().toISOString(),
      payload: next,
    },
  );
}

export async function ensureAutomationIndexHydrated(): Promise<DurableAutomationsGlobalState> {
  if (memoryCache) return memoryCache;
  if (hydratePromise) {
    await hydratePromise;
    return getCache();
  }

  hydratePromise = (async () => {
    const loaded = await loadSupabaseUserState<{
      version?: number;
      updatedAt?: string;
      payload?: DurableAutomationsGlobalState;
    }>(AUTOMATIONS_GLOBAL_USER_ID, AUTOMATIONS_GLOBAL_DOMAIN_KEY);

    const envelope = loaded?.payload;
    const payload =
      envelope &&
      typeof envelope === "object" &&
      "payload" in envelope &&
      (envelope as { payload?: DurableAutomationsGlobalState }).payload
        ? (envelope as { payload: DurableAutomationsGlobalState }).payload
        : (envelope as DurableAutomationsGlobalState | undefined);

    if (payload && typeof payload === "object") {
      memoryCache = prune({
        userIds: Array.isArray(payload.userIds) ? payload.userIds : [],
        tickClaims: Array.isArray(payload.tickClaims) ? payload.tickClaims : [],
      });
    } else {
      memoryCache = emptyState();
    }

    // Recover user ids from durable domain rows when index is empty.
    if (memoryCache.userIds.length === 0) {
      const discovered = await listSupabaseUserIdsForDomain(AUTOMATIONS_DOMAIN_KEY);
      if (discovered.length > 0) {
        memoryCache.userIds = discovered.filter(
          (id) => id !== AUTOMATIONS_GLOBAL_USER_ID,
        );
        await persistGlobal(memoryCache);
      }
    }
  })();

  try {
    await hydratePromise;
  } finally {
    hydratePromise = null;
  }
  return getCache();
}

export async function listAutomationOwnerUserIds(): Promise<string[]> {
  const cache = await ensureAutomationIndexHydrated();
  return [...cache.userIds];
}

export async function registerAutomationUserId(userId: string): Promise<void> {
  if (!userId.trim()) return;
  const cache = await ensureAutomationIndexHydrated();
  if (cache.userIds.includes(userId)) return;
  cache.userIds.push(userId);
  await persistGlobal(cache);
}

export async function unregisterAutomationUserIdIfEmpty(
  userId: string,
): Promise<void> {
  const cache = await ensureAutomationIndexHydrated();
  if (!cache.userIds.includes(userId)) return;
  // Caller decides emptiness; always remove when asked after empty snapshot.
  cache.userIds = cache.userIds.filter((id) => id !== userId);
  await persistGlobal(cache);
}

/**
 * Cross-instance tick claim (LINE webhook pattern).
 * Returns false when this slot was already claimed.
 */
export async function claimAutomationTickSlot(
  userId: string,
  automationId: string,
  nextRunIso: string | null,
): Promise<boolean> {
  const slot = nextRunIso?.trim() || "due";
  const key = `${userId}:${automationId}:${slot}`;
  const cache = await ensureAutomationIndexHydrated();
  if (cache.tickClaims.some((entry) => entry.key === key)) {
    return false;
  }
  cache.tickClaims.push({ key, at: Date.now() });
  await persistGlobal(cache);
  return true;
}

export function resetAutomationsGlobalDurableForTests(): void {
  memoryCache = null;
  hydratePromise = null;
}
