import "server-only";

import {
  loadSupabaseUserState,
  upsertSupabaseUserState,
} from "@/lib/persistence/supabase-user-state";

import {
  getRevenueMaxState,
  replaceRevenueMaxUsers,
  setRevenueMaxState,
} from "./store";
import type { RevenueMaxUserState } from "./types";

export const REVENUE_MAX_DOMAIN = "atlasRevenueMaximize";

const hydrated = new Set<string>();

export async function ensureRevenueMaxHydrated(userId: string): Promise<void> {
  if (hydrated.has(userId)) return;
  hydrated.add(userId);
  const loaded = await loadSupabaseUserState<{ payload?: RevenueMaxUserState }>(
    userId,
    REVENUE_MAX_DOMAIN,
  );
  const payload = loaded?.payload?.payload ?? (loaded?.payload as RevenueMaxUserState | undefined);
  if (payload && payload.userId === userId) {
    setRevenueMaxState(payload);
  }
}

export async function persistRevenueMax(userId: string): Promise<void> {
  const state = getRevenueMaxState(userId);
  await upsertSupabaseUserState(userId, REVENUE_MAX_DOMAIN, {
    version: 1,
    updatedAt: state.updatedAt,
    payload: state,
  });
}

export function resetRevenueMaxHydrationForTests(): void {
  hydrated.clear();
  replaceRevenueMaxUsers([]);
}
