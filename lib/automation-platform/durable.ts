import "server-only";

import {
  loadDurableDomain,
  persistDurableDomain,
} from "@/lib/persistence/durable-domain";
import type { AutomationV2 } from "@/lib/automation-platform/types";
import {
  memoryGetAutomation,
  memoryInsertAutomation,
  memoryListAutomationsForUser,
  memoryUpdateAutomation,
} from "@/lib/automation-platform/repository/memory-store";

export const AUTOMATIONS_V2_DOMAIN_KEY = "atlasAutomationsV2";

export type DurableAutomationsV2State = {
  automations: AutomationV2[];
};

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

function snapshot(userId: string): DurableAutomationsV2State {
  return { automations: memoryListAutomationsForUser(userId) };
}

function compactAutomationsV2(
  state: DurableAutomationsV2State,
): DurableAutomationsV2State {
  return {
    automations: state.automations.slice(0, 40).map((row) => ({
      ...row,
      description: row.description.slice(0, 240),
      instruction: {
        ...row.instruction,
        freeformNotes: row.instruction.freeformNotes.slice(0, 2000),
      },
    })),
  };
}

export function schedulePersistAutomationsV2(userId: string): void {
  void persistDurableDomain(userId, AUTOMATIONS_V2_DOMAIN_KEY, snapshot(userId), {
    compact: compactAutomationsV2,
    forceSupabase: true,
  });
}

export async function ensureAutomationsV2Hydrated(userId: string): Promise<void> {
  const hydrated = getHydrated();
  if (hydrated.has(userId)) return;
  hydrated.add(userId);

  if (memoryListAutomationsForUser(userId).length > 0) return;

  const loaded = await loadDurableDomain<DurableAutomationsV2State>(
    userId,
    AUTOMATIONS_V2_DOMAIN_KEY,
  );
  if (!loaded?.automations || !Array.isArray(loaded.automations)) return;

  for (const row of loaded.automations) {
    if (!row?.id || row.userId !== userId) continue;
    if (!memoryGetAutomation(row.id)) {
      memoryInsertAutomation(row);
    }
  }
}

export function persistAutomationV2Now(record: AutomationV2): AutomationV2 {
  const existing = memoryGetAutomation(record.id);
  const saved = existing
    ? memoryUpdateAutomation(record)
    : memoryInsertAutomation(record);
  schedulePersistAutomationsV2(record.userId);
  return saved;
}
