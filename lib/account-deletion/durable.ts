import "server-only";

import {
  loadDurableDomain,
  persistDurableDomain,
} from "@/lib/persistence/durable-domain";
import {
  deleteSupabaseUserDomains,
  listSupabaseUserIdsForDomain,
  upsertSupabaseUserState,
  loadSupabaseUserState,
} from "@/lib/persistence/supabase-user-state";
import { clearClerkPrivateMetadataKeys } from "@/lib/persistence/clerk-private-metadata";

import type { AccountDeletionRecord } from "./types";
import {
  getAccountDeletionRecord,
  listAccountDeletionRecords,
  saveAccountDeletionRecord,
} from "./store";

export const ACCOUNT_DELETION_DOMAIN_KEY = "atlasAccountDeletion";
export const ACCOUNT_DELETION_GLOBAL_USER_ID = "__atlas_account_deletion__";
export const ACCOUNT_DELETION_GLOBAL_DOMAIN_KEY = "atlasAccountDeletionGlobal";

/** Durable user domains wiped on purge (billing history intentionally excluded). */
export const ACCOUNT_WIPE_DOMAIN_KEYS = [
  "atlasWorkMemory",
  "atlasLearning",
  "atlasNotifications",
  "atlasAutomations",
  "atlasCommanderRuns",
  "atlasExternalAuth",
  "atlasLineLink",
  "atlasAccountDeletion",
] as const;

type GlobalIndex = {
  userIds: string[];
};

let globalCache: GlobalIndex | null = null;

async function loadGlobalIndex(): Promise<GlobalIndex> {
  if (globalCache) return globalCache;
  const loaded = await loadSupabaseUserState<{
    payload?: GlobalIndex;
  }>(ACCOUNT_DELETION_GLOBAL_USER_ID, ACCOUNT_DELETION_GLOBAL_DOMAIN_KEY);

  const payload =
    loaded?.payload &&
    typeof loaded.payload === "object" &&
    "payload" in loaded.payload
      ? (loaded.payload as { payload: GlobalIndex }).payload
      : (loaded?.payload as GlobalIndex | undefined);

  globalCache = {
    userIds: Array.isArray(payload?.userIds) ? payload.userIds : [],
  };

  if (globalCache.userIds.length === 0) {
    const discovered = await listSupabaseUserIdsForDomain(
      ACCOUNT_DELETION_DOMAIN_KEY,
    );
    globalCache.userIds = discovered.filter(
      (id) => id !== ACCOUNT_DELETION_GLOBAL_USER_ID,
    );
  }

  return globalCache;
}

async function persistGlobalIndex(index: GlobalIndex): Promise<void> {
  globalCache = index;
  await upsertSupabaseUserState(
    ACCOUNT_DELETION_GLOBAL_USER_ID,
    ACCOUNT_DELETION_GLOBAL_DOMAIN_KEY,
    {
      version: 1,
      updatedAt: new Date().toISOString(),
      payload: index,
    },
  );
}

export function schedulePersistAccountDeletion(record: AccountDeletionRecord): void {
  saveAccountDeletionRecord(record);
  void persistDurableDomain(
    record.userId,
    ACCOUNT_DELETION_DOMAIN_KEY,
    record,
    { compact: (value) => value },
  ).then(async () => {
    const index = await loadGlobalIndex();
    if (record.status === "scheduled" && !index.userIds.includes(record.userId)) {
      index.userIds.push(record.userId);
      await persistGlobalIndex(index);
    }
    if (record.status !== "scheduled") {
      index.userIds = index.userIds.filter((id) => id !== record.userId);
      await persistGlobalIndex(index);
    }
  });
}

export async function ensureAccountDeletionHydrated(
  userId: string,
): Promise<AccountDeletionRecord | null> {
  const existing = getAccountDeletionRecord(userId);
  if (existing) return existing;

  const loaded = await loadDurableDomain<AccountDeletionRecord>(
    userId,
    ACCOUNT_DELETION_DOMAIN_KEY,
  );
  if (!loaded?.userId) return null;
  return saveAccountDeletionRecord(loaded);
}

export async function listScheduledAccountDeletions(): Promise<
  AccountDeletionRecord[]
> {
  const index = await loadGlobalIndex();
  for (const userId of index.userIds) {
    await ensureAccountDeletionHydrated(userId);
  }
  return listAccountDeletionRecords().filter((row) => row.status === "scheduled");
}

export async function wipeUserDurableDomains(userId: string): Promise<void> {
  await deleteSupabaseUserDomains(userId, [...ACCOUNT_WIPE_DOMAIN_KEYS]);
  await clearClerkPrivateMetadataKeys(userId, [...ACCOUNT_WIPE_DOMAIN_KEYS]);
}

export function resetAccountDeletionDurableForTests(): void {
  globalCache = null;
}
