import "server-only";

import type { AutomationRun } from "@/lib/automation-platform/types";
import { applyRunRetentionPolicy } from "@/lib/automation-platform/history/retention";
import {
  dbGetRun,
  dbInsertRun,
  dbListRunsForAutomation,
  dbUpsertRun,
} from "@/lib/automation-platform/repository/db-store";
import {
  memoryGetRun,
  memoryListRunsForUser,
  memoryRestoreRun,
  memoryUpdateRun,
} from "@/lib/automation-platform/repository/memory-store";

/** @deprecated JSON domain — not SoT after P1-03. */
export const AUTOMATION_RUNS_V2_DOMAIN_KEY = "atlasAutomationRunsV2";

type HydrationFlags = Set<string>;

function getHydrated(): HydrationFlags {
  const globalScope = globalThis as typeof globalThis & {
    __atlasAutomationRunsV2Hydrated?: HydrationFlags;
  };
  if (!globalScope.__atlasAutomationRunsV2Hydrated) {
    globalScope.__atlasAutomationRunsV2Hydrated = new Set();
  }
  return globalScope.__atlasAutomationRunsV2Hydrated;
}

export function resetAutomationRunsV2DurableForTests(): void {
  getHydrated().clear();
}

function cacheRun(run: AutomationRun): void {
  memoryRestoreRun(run);
}

/**
 * Hydrate process cache from DB SoT for a user's runs (via known automations list).
 * Tick/dispatch read dispatchable runs directly from DB — not this cache.
 */
export async function ensureAutomationRunsV2Hydrated(
  userId: string,
): Promise<void> {
  const hydrated = getHydrated();
  if (hydrated.has(userId)) return;
  hydrated.add(userId);

  // Prefer listing from cache of automations then runs; if empty, nothing to hydrate.
  const { dbListAutomationsForUser } = await import(
    "@/lib/automation-platform/repository/db-store"
  );
  const automations = await dbListAutomationsForUser(userId);
  for (const automation of automations) {
    const runs = await dbListRunsForAutomation({
      userId,
      automationId: automation.id,
    });
    for (const run of applyRunRetentionPolicy(runs)) {
      cacheRun(run);
    }
  }
}

export async function persistAutomationRunNow(
  run: AutomationRun,
): Promise<AutomationRun> {
  const saved = await dbUpsertRun(run);
  cacheRun(saved);
  return saved;
}

export async function insertAutomationRunSot(run: AutomationRun): Promise<{
  run: AutomationRun;
  created: boolean;
}> {
  const inserted = await dbInsertRun(run);
  cacheRun(inserted.run);
  return inserted;
}

export async function getAutomationRunFromSot(
  id: string,
): Promise<AutomationRun | null> {
  const row = await dbGetRun(id);
  if (row) cacheRun(row);
  return row;
}

export function listCachedRunsForUser(userId: string): AutomationRun[] {
  return memoryListRunsForUser(userId);
}

export function updateCachedRun(run: AutomationRun): AutomationRun {
  return memoryUpdateRun(run);
}

export function getCachedRun(id: string): AutomationRun | null {
  return memoryGetRun(id);
}
