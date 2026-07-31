import "server-only";

import type { BetaImprovementEntry, BetaOpsPeriod } from "./types";

type Store = { entries: BetaImprovementEntry[] };

function getStore(): Store {
  const scope = globalThis as typeof globalThis & {
    __minervotBetaImprovementLog?: Store;
  };
  if (!scope.__minervotBetaImprovementLog) {
    scope.__minervotBetaImprovementLog = { entries: [] };
  }
  return scope.__minervotBetaImprovementLog;
}

export function resetBetaImprovementLogForTests(): void {
  getStore().entries = [];
}

/** Append only when evidence cites measured deltas. */
export function appendBetaImprovement(input: {
  title: string;
  evidence: string;
  period?: BetaOpsPeriod | "adhoc";
}): BetaImprovementEntry {
  const entry: BetaImprovementEntry = {
    id: `imp_${Date.now().toString(36)}`,
    at: new Date().toISOString(),
    title: input.title.slice(0, 200),
    evidence: input.evidence.slice(0, 500),
    period: input.period ?? "adhoc",
  };
  getStore().entries.unshift(entry);
  getStore().entries = getStore().entries.slice(0, 100);
  return entry;
}

export function listBetaImprovements(): readonly BetaImprovementEntry[] {
  return getStore().entries;
}
