import "server-only";

import {
  loadSupabaseUserState,
  upsertSupabaseUserState,
} from "@/lib/persistence/supabase-user-state";

import {
  listAiUsageEvents,
  replaceUsageDurableState,
  serializeUsageSnapshots,
} from "./store";
import type { AiUsageEvent, UsageSnapshot } from "./types";

/** Global billing usage ledger in atlas_user_state (service role only). */
export const BILLING_USAGE_GLOBAL_USER_ID = "__atlas_billing_usage__";
export const BILLING_USAGE_DOMAIN_KEY = "atlasBillingUsage";

type BillingUsageDurablePayload = {
  version: 1;
  updatedAt: string;
  snapshots: Record<string, UsageSnapshot>;
  events: AiUsageEvent[];
};

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let hydrated = false;

function buildPayload(): BillingUsageDurablePayload {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    snapshots: serializeUsageSnapshots(),
    events: listAiUsageEvents().slice(-5000),
  };
}

export async function persistBillingUsageNow(): Promise<boolean> {
  const payload = buildPayload();
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

  const root = loaded?.payload as
    | { payload?: BillingUsageDurablePayload }
    | BillingUsageDurablePayload
    | undefined;
  const payload =
    root && "payload" in root && root.payload && "snapshots" in root.payload
      ? root.payload
      : root && "snapshots" in (root as object)
        ? (root as BillingUsageDurablePayload)
        : null;

  if (payload?.snapshots) {
    replaceUsageDurableState({
      snapshots: payload.snapshots,
      events: Array.isArray(payload.events) ? payload.events : [],
    });
  }
}

export function resetBillingUsageDurableForTests(): void {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  hydrated = false;
}
