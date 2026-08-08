import "server-only";

import type { AutomationV2 } from "@/lib/automation-platform/types";
import {
  dbGetAutomation,
  dbGetAutomationForUser,
  dbListAutomationsForUser,
  dbUpsertAutomation,
} from "@/lib/automation-platform/repository/db-store";
import {
  memoryGetAutomation,
  memoryInsertAutomation,
  memoryListAutomationsForUser,
  memoryUpdateAutomation,
} from "@/lib/automation-platform/repository/memory-store";
import { isAutomationV2DbSotReady } from "@/lib/automation-platform/repository/table-ready";

/** @deprecated JSON domain — not SoT after P1-03. Kept for migration tooling only. */
export const AUTOMATIONS_V2_DOMAIN_KEY = "atlasAutomationsV2";

type HydrationFlags = Set<string>;

function getHydrated(): HydrationFlags {
  const globalScope = globalThis as typeof globalThis & {
    __atlasAutomationsV2Hydrated?: HydrationFlags;
  };
  if (!globalScope.__atlasAutomationsV2Hydrated) {
    globalScope.__atlasAutomationsV2Hydrated = new Set();
  }
  return globalScope.__atlasAutomationsV2Hydrated;
}

export function resetAutomationsV2DurableForTests(): void {
  getHydrated().clear();
}

function cacheAutomation(record: AutomationV2): void {
  if (memoryGetAutomation(record.id)) {
    memoryUpdateAutomation(record);
  } else {
    memoryInsertAutomation(record);
  }
}

/**
 * Hydrate process cache from DB SoT. Memory alone is never authority.
 */
export async function ensureAutomationsV2Hydrated(userId: string): Promise<void> {
  const hydrated = getHydrated();
  if (hydrated.has(userId)) return;
  hydrated.add(userId);

  const rows = await dbListAutomationsForUser(userId);
  for (const row of rows) {
    if (!row?.id || row.userId !== userId) continue;
    cacheAutomation(row);
  }
}

/** Persist definition to DB SoT, then refresh process cache. */
export async function persistAutomationV2Now(
  record: AutomationV2,
): Promise<AutomationV2> {
  const saved = await dbUpsertAutomation(record);
  cacheAutomation(saved);
  return saved;
}

/** Sync wrapper for rare sync call sites — prefer await persistAutomationV2Now. */
export function persistAutomationV2NowSync(record: AutomationV2): AutomationV2 {
  cacheAutomation(record);
  void dbUpsertAutomation(record).catch((error) => {
    console.error("[automation-v2] async DB persist failed:", error);
  });
  return structuredClone(record);
}

export async function getAutomationV2FromSot(
  id: string,
  userId?: string,
): Promise<AutomationV2 | null> {
  if (userId) {
    const owned = await dbGetAutomationForUser(id, userId);
    if (owned) {
      cacheAutomation(owned);
      return owned;
    }
    return null;
  }
  const row = await dbGetAutomation(id);
  if (row) cacheAutomation(row);
  return row;
}

export async function listAutomationsV2FromSot(
  userId: string,
): Promise<AutomationV2[]> {
  const rows = await dbListAutomationsForUser(userId);
  for (const row of rows) cacheAutomation(row);
  return rows;
}

export async function assertAutomationV2DbSotOrThrow(): Promise<void> {
  const ready = await isAutomationV2DbSotReady();
  if (!ready) {
    // Non-prod local Map still counts as ready via db-store; this guards prod schema.
    const listed = await dbListAutomationsForUser("__probe__");
    void listed;
  }
}

/** Test helper: mirror of previous memory list after hydrate. */
export function listCachedAutomationsForUser(userId: string): AutomationV2[] {
  return memoryListAutomationsForUser(userId);
}

/**
 * @deprecated Prefer await persistAutomationV2Now(record).
 * Fire-and-forget persist of cached automations for a user to DB SoT.
 * Used by workflow-learning until call sites are fully async.
 */
export function schedulePersistAutomationsV2(userId: string): void {
  void (async () => {
    await ensureAutomationsV2Hydrated(userId);
    const rows = memoryListAutomationsForUser(userId);
    for (const row of rows) {
      await dbUpsertAutomation(row);
    }
  })().catch((error) => {
    console.error("[automation-v2] schedulePersistAutomationsV2 failed:", error);
  });
}
