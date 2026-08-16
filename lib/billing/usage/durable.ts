import "server-only";

import { isAtlasProduction } from "@/lib/runtime/is-production";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";
import {
  loadSupabaseUserState,
  upsertSupabaseUserState,
} from "@/lib/persistence/supabase-user-state";

import {
  listAiUsageEvents,
  mergeUsageDurableState,
  replaceUsageDurableState,
  serializeUsageClaimKeys,
  serializeUsageSnapshots,
} from "./store";
import type { AiUsageEvent, UsageSnapshot } from "./types";

/** Legacy global billing usage ledger (migration source). */
export const BILLING_USAGE_GLOBAL_USER_ID = "__atlas_billing_usage__";
export const BILLING_USAGE_DOMAIN_KEY = "atlasBillingUsage";

type BillingUsageDurablePayload = {
  version: 1 | 2;
  updatedAt: string;
  userId?: string;
  snapshots: Record<string, UsageSnapshot>;
  events: AiUsageEvent[];
  claimKeys?: string[];
};

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let hydrated = false;
const hydratedUsers = new Set<string>();

function unwrapPayload(loaded: unknown): BillingUsageDurablePayload | null {
  const root = loaded as
    | { payload?: BillingUsageDurablePayload }
    | BillingUsageDurablePayload
    | undefined;
  if (!root) return null;
  if ("payload" in root && root.payload && "snapshots" in root.payload) {
    return root.payload;
  }
  if ("snapshots" in (root as object)) {
    return root as BillingUsageDurablePayload;
  }
  return null;
}

function buildGlobalPayload(): BillingUsageDurablePayload {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    snapshots: serializeUsageSnapshots(),
    events: listAiUsageEvents().slice(-5000),
    claimKeys: serializeUsageClaimKeys(),
  };
}

function buildUserPayload(userId: string): BillingUsageDurablePayload {
  const snapshots = Object.fromEntries(
    Object.entries(serializeUsageSnapshots()).filter(
      ([, snapshot]) => snapshot.userId === userId,
    ),
  );
  return {
    version: 2,
    updatedAt: new Date().toISOString(),
    userId,
    snapshots,
    events: listAiUsageEvents(userId).slice(-5000),
    claimKeys: serializeUsageClaimKeys().filter((key) =>
      key.startsWith(`${userId}:`),
    ),
  };
}

export async function persistBillingUsageNow(): Promise<boolean> {
  const payload = buildGlobalPayload();
  return upsertSupabaseUserState(
    BILLING_USAGE_GLOBAL_USER_ID,
    BILLING_USAGE_DOMAIN_KEY,
    {
      version: 1,
      updatedAt: payload.updatedAt,
      payload,
    },
  );
}

export async function persistBillingUsageForUserNow(
  userId: string,
): Promise<boolean> {
  const payload = buildUserPayload(userId);
  const userOk = await upsertSupabaseUserState(
    userId,
    BILLING_USAGE_DOMAIN_KEY,
    {
      version: 2,
      updatedAt: payload.updatedAt,
      payload,
    },
  );
  void persistBillingUsageNow();
  return userOk;
}

export function schedulePersistBillingUsage(): void {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistBillingUsageNow().then((ok) => {
      if (!ok) {
        console.warn(
          "[billing-usage] durable Supabase persist skipped or failed (not treated as saved).",
        );
      }
    });
  }, 400);
}

export async function ensureBillingUsageHydrated(): Promise<void> {
  if (hydrated) return;
  hydrated = true;

  const loaded = await loadSupabaseUserState<{
    payload?: BillingUsageDurablePayload;
  }>(BILLING_USAGE_GLOBAL_USER_ID, BILLING_USAGE_DOMAIN_KEY);

  const payload = unwrapPayload(loaded?.payload);
  if (payload?.snapshots) {
    replaceUsageDurableState({
      snapshots: payload.snapshots,
      events: Array.isArray(payload.events) ? payload.events : [],
      claimKeys: Array.isArray(payload.claimKeys) ? payload.claimKeys : [],
    });
  }
}

export async function ensureBillingUsageHydratedForUser(
  userId: string,
): Promise<{ available: boolean; reason: string | null }> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    if (isAtlasProduction()) {
      return { available: false, reason: "usage_store_unavailable" };
    }
    return { available: true, reason: null };
  }

  try {
    await ensureBillingUsageHydrated();
    if (!hydratedUsers.has(userId)) {
      const loaded = await loadSupabaseUserState<{
        payload?: BillingUsageDurablePayload;
      }>(userId, BILLING_USAGE_DOMAIN_KEY);
      const payload = unwrapPayload(loaded?.payload);
      if (payload?.snapshots) {
        mergeUsageDurableState({
          snapshots: payload.snapshots,
          events: Array.isArray(payload.events) ? payload.events : [],
          claimKeys: Array.isArray(payload.claimKeys) ? payload.claimKeys : [],
        });
      }
      hydratedUsers.add(userId);
    }
    return { available: true, reason: null };
  } catch {
    return { available: false, reason: "usage_store_unavailable" };
  }
}

export function resetBillingUsageDurableForTests(): void {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  hydrated = false;
  hydratedUsers.clear();
}
