import "server-only";

import {
  loadSupabaseUserState,
  upsertSupabaseUserState,
} from "@/lib/persistence/supabase-user-state";

export const OWNER_LKG_USER_ID = "__atlas_owner_metrics__";
export const OWNER_LKG_DOMAIN = "atlasOwnerLastKnownGood";

export type OwnerLastKnownGoodPayload = {
  version: 1;
  updatedAt: string;
  stripeMonth?: {
    fetchedAt: string;
    mode: "live" | "test" | null;
    currency: string;
    grossRevenue: number;
    refunds: number;
    fees: number;
    netRevenue: number;
    upcomingPayoutAmount: number | null;
    upcomingPayoutAt: string | null;
    upcomingPayoutStatus: "scheduled" | "pending" | "paid" | "unknown" | null;
  };
  stripeSubs?: {
    fetchedAt: string;
    paidSubscribers: number;
    cancelScheduledCount: number;
    churnedSubscribers: number;
    planBreakdown: readonly {
      planId: string;
      planName: string;
      monthlyPriceJpy: number;
      activeSubscribers: number;
      mrrJpy: number;
    }[];
    mrrJpy: number;
  };
  registeredUsers?: {
    fetchedAt: string;
    total: number;
  };
  aiMonthly?: {
    fetchedAt: string;
    month: string;
    requests: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    recordedCostUsd: number;
  };
  webhook?: {
    fetchedAt: string;
    successRatePercent: number | null;
    failureCount: number | null;
    totalCount: number;
    lastSyncedAt: string | null;
  };
};

let memoryCache: OwnerLastKnownGoodPayload | null = null;

export function getOwnerLastKnownGoodMemory(): OwnerLastKnownGoodPayload | null {
  return memoryCache;
}

export function replaceOwnerLastKnownGoodMemory(
  payload: OwnerLastKnownGoodPayload | null,
): void {
  memoryCache = payload;
}

export async function loadOwnerLastKnownGood(): Promise<OwnerLastKnownGoodPayload | null> {
  const loaded = await loadSupabaseUserState<OwnerLastKnownGoodPayload | { payload?: OwnerLastKnownGoodPayload }>(
    OWNER_LKG_USER_ID,
    OWNER_LKG_DOMAIN,
  );
  const raw = loaded?.payload;
  const payload =
    raw && typeof raw === "object" && "stripeMonth" in raw
      ? (raw as OwnerLastKnownGoodPayload)
      : raw && typeof raw === "object" && "payload" in raw
        ? (raw as { payload?: OwnerLastKnownGoodPayload }).payload ?? null
        : null;
  if (payload && payload.version === 1) {
    memoryCache = payload;
    return payload;
  }
  return memoryCache;
}

export async function persistOwnerLastKnownGood(
  next: OwnerLastKnownGoodPayload,
): Promise<boolean> {
  memoryCache = next;
  return upsertSupabaseUserState(OWNER_LKG_USER_ID, OWNER_LKG_DOMAIN, {
    version: 1,
    updatedAt: next.updatedAt,
    payload: next,
  });
}

export function resetOwnerLastKnownGoodForTests(): void {
  memoryCache = null;
}

export function mergeOwnerLastKnownGood(
  current: OwnerLastKnownGoodPayload | null,
  patch: Partial<Omit<OwnerLastKnownGoodPayload, "version">>,
): OwnerLastKnownGoodPayload {
  return {
    version: 1,
    updatedAt: patch.updatedAt ?? current?.updatedAt ?? new Date().toISOString(),
    stripeMonth: patch.stripeMonth ?? current?.stripeMonth,
    stripeSubs: patch.stripeSubs ?? current?.stripeSubs,
    registeredUsers: patch.registeredUsers ?? current?.registeredUsers,
    aiMonthly: patch.aiMonthly ?? current?.aiMonthly,
    webhook: patch.webhook ?? current?.webhook,
  };
}
