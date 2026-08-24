import "server-only";

import {
  loadSupabaseUserState,
  upsertSupabaseUserState,
} from "@/lib/persistence/supabase-user-state";

import { FIRST_REVENUE_DOMAIN } from "./constants";
import {
  getOfferLpStatus,
  listFirstRevenueEvents,
  listOfferSessions,
  listPublishedUrls,
  replaceFirstRevenueEvents,
  replaceOfferSessions,
  replacePublishedUrls,
  resetFirstRevenueStoreForTests,
  setOfferLpStatus,
} from "./store";
import type { OfferLpStatus } from "./types";

const OWNER_KEY = "__atlas_first_revenue__";
let hydrated = false;

type Payload = {
  events?: ReturnType<typeof listFirstRevenueEvents>;
  sessions?: ReturnType<typeof listOfferSessions>;
  lpStatus?: OfferLpStatus;
  publishedUrls?: Record<string, string>;
};

export async function ensureFirstRevenueHydrated(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  const loaded = await loadSupabaseUserState<{ payload?: Payload }>(
    OWNER_KEY,
    FIRST_REVENUE_DOMAIN,
  );
  const inner = loaded?.payload?.payload;
  if (!inner) return;
  if (inner.events) replaceFirstRevenueEvents(inner.events);
  if (inner.sessions) replaceOfferSessions(inner.sessions);
  if (inner.lpStatus) setOfferLpStatus(inner.lpStatus);
  if (inner.publishedUrls) replacePublishedUrls(inner.publishedUrls);
}

export async function persistFirstRevenue(): Promise<void> {
  await upsertSupabaseUserState(OWNER_KEY, FIRST_REVENUE_DOMAIN, {
    version: 1,
    updatedAt: new Date().toISOString(),
    payload: {
      events: listFirstRevenueEvents(),
      sessions: listOfferSessions(),
      lpStatus: getOfferLpStatus(),
      publishedUrls: listPublishedUrls(),
    } satisfies Payload,
  });
}

export function resetFirstRevenueHydrationForTests(): void {
  hydrated = false;
  resetFirstRevenueStoreForTests();
}
