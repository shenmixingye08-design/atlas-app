import "server-only";

import {
  loadDurableDomain,
  persistDurableDomain,
} from "@/lib/persistence/durable-domain";
import type { AutomationRun } from "@/lib/automation-platform/types";
import {
  memoryGetRun,
  memoryListRunsForUser,
  memoryRestoreRun,
  memoryUpdateRun,
} from "@/lib/automation-platform/repository/memory-store";

export const AUTOMATION_RUNS_V2_DOMAIN_KEY = "atlasAutomationRunsV2";

export type DurableAutomationRunsV2State = {
  runs: AutomationRun[];
};

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

function snapshot(userId: string): DurableAutomationRunsV2State {
  return { runs: memoryListRunsForUser(userId) };
}

function compactRuns(
  state: DurableAutomationRunsV2State,
): DurableAutomationRunsV2State {
  return {
    runs: state.runs.slice(0, 80).map((run) => ({
      ...run,
      resultSummary: run.resultSummary?.slice(0, 500) ?? null,
      lastErrorMessage: run.lastErrorMessage?.slice(0, 500) ?? null,
      preparation: run.preparation
        ? {
            ...run.preparation,
            summary: run.preparation.summary.slice(0, 2000),
          }
        : null,
    })),
  };
}

export function schedulePersistAutomationRunsV2(userId: string): void {
  void persistDurableDomain(
    userId,
    AUTOMATION_RUNS_V2_DOMAIN_KEY,
    snapshot(userId),
    {
      compact: compactRuns,
      forceSupabase: true,
    },
  );
}

export async function ensureAutomationRunsV2Hydrated(
  userId: string,
): Promise<void> {
  const hydrated = getHydrated();
  if (hydrated.has(userId)) return;
  hydrated.add(userId);

  if (memoryListRunsForUser(userId).length > 0) return;

  const loaded = await loadDurableDomain<DurableAutomationRunsV2State>(
    userId,
    AUTOMATION_RUNS_V2_DOMAIN_KEY,
  );
  if (!loaded?.runs || !Array.isArray(loaded.runs)) return;

  for (const row of loaded.runs) {
    if (!row?.id || row.userId !== userId) continue;
    if (!memoryGetRun(row.id)) {
      memoryRestoreRun(row);
    }
  }
}

export function persistAutomationRunNow(run: AutomationRun): AutomationRun {
  const existing = memoryGetRun(run.id);
  const saved = existing ? memoryUpdateRun(run) : memoryRestoreRun(run);
  schedulePersistAutomationRunsV2(run.userId);
  return saved;
}
