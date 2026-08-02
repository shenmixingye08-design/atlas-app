import "server-only";

import {
  loadDurableDomain,
  persistDurableDomain,
} from "@/lib/persistence/durable-domain";
import type {
  PersonalMemoryRecord,
  PersonalMemorySettings,
} from "@/lib/personal-memory/types";
import { DEFAULT_PERSONAL_MEMORY_SETTINGS } from "@/lib/personal-memory/types";
import {
  clearAllPersonalMemoryData,
  listCorrectionCounters,
  listStoredPersonalMemories,
  readPersonalMemorySettings,
  replaceStoredPersonalMemories,
  writePersonalMemorySettings,
} from "@/lib/personal-memory/store";
import type { DeliverableQualityEvaluation } from "@/lib/personal-memory/quality/types";
import {
  clearQualityEvaluations,
  listQualityEvaluations,
  replaceQualityEvaluations,
} from "@/lib/personal-memory/quality/store";
import type { PredictionHistoryEntry } from "@/lib/personal-memory/predict/types";
import {
  clearPredictStoreForUser,
  listDismissedSuggestionFingerprints,
  listPredictionHistory,
  replaceDismissedSuggestions,
  replacePredictionHistory,
} from "@/lib/personal-memory/predict/store";

export const PERSONAL_MEMORY_DOMAIN_KEY = "atlasPersonalMemory";

export type DurablePersonalMemoryState = {
  memories: PersonalMemoryRecord[];
  settings: PersonalMemorySettings;
  correctionCounters: Array<{
    fingerprint: string;
    count: number;
    lastSeenAt: string;
    scopeHint: string | null;
    automationId: string | null;
  }>;
  rejectedFingerprints: string[];
  qualityEvaluations?: DeliverableQualityEvaluation[];
  predictionHistory?: PredictionHistoryEntry[];
  dismissedSuggestionFingerprints?: string[];
};

type HydrationFlags = Set<string>;

function getHydrated(): HydrationFlags {
  const globalScope = globalThis as typeof globalThis & {
    __atlasPersonalMemoryHydrated?: HydrationFlags;
  };
  if (!globalScope.__atlasPersonalMemoryHydrated) {
    globalScope.__atlasPersonalMemoryHydrated = new Set();
  }
  return globalScope.__atlasPersonalMemoryHydrated;
}

export function resetPersonalMemoryDurableForTests(): void {
  getHydrated().clear();
}

function snapshot(userId: string): DurablePersonalMemoryState {
  const g = globalThis as typeof globalThis & {
    __atlasPersonalMemoryStore?: {
      rejectedFingerprints: Map<string, Set<string>>;
    };
  };
  return {
    memories: listStoredPersonalMemories(userId).filter(
      (m) => m.status !== "deleted",
    ),
    settings: readPersonalMemorySettings(userId),
    correctionCounters: listCorrectionCounters(userId),
    rejectedFingerprints: [
      ...(g.__atlasPersonalMemoryStore?.rejectedFingerprints.get(userId) ?? []),
    ],
    qualityEvaluations: listQualityEvaluations(userId).slice(0, 100).map((row) => ({
      ...row,
      generatedText: row.generatedText.slice(0, 2000),
      correctedText: row.correctedText.slice(0, 2000),
    })),
    predictionHistory: listPredictionHistory(userId).slice(0, 150),
    dismissedSuggestionFingerprints:
      listDismissedSuggestionFingerprints(userId).slice(0, 100),
  };
}

function compact(
  state: DurablePersonalMemoryState,
): DurablePersonalMemoryState {
  return {
    settings: state.settings,
    correctionCounters: state.correctionCounters.slice(-100),
    rejectedFingerprints: state.rejectedFingerprints.slice(-200),
    qualityEvaluations: (state.qualityEvaluations ?? []).slice(0, 100).map((row) => ({
      ...row,
      generatedText: row.generatedText.slice(0, 1200),
      correctedText: row.correctedText.slice(0, 1200),
    })),
    predictionHistory: (state.predictionHistory ?? []).slice(0, 150).map((row) => ({
      ...row,
      summary: row.summary.slice(0, 200),
      title: row.title.slice(0, 120),
    })),
    dismissedSuggestionFingerprints: (
      state.dismissedSuggestionFingerprints ?? []
    ).slice(0, 100),
    memories: state.memories.slice(0, 300).map((row) => ({
      ...row,
      summary: row.summary.slice(0, 400),
      title: row.title.slice(0, 120),
      evidence: row.evidence.slice(0, 5).map((e) => ({
        ...e,
        summary: e.summary.slice(0, 200),
      })),
      // Never persist secret-looking blobs — values already validated on write
      value: row.sensitivity === "restricted" ? { redacted: true } : row.value,
    })),
  };
}

export function schedulePersistPersonalMemory(userId: string): void {
  void persistDurableDomain(userId, PERSONAL_MEMORY_DOMAIN_KEY, snapshot(userId), {
    compact,
    forceSupabase: true,
  });
}

export async function ensurePersonalMemoryHydrated(
  userId: string,
): Promise<void> {
  const hydrated = getHydrated();
  if (hydrated.has(userId)) return;
  hydrated.add(userId);

  if (listStoredPersonalMemories(userId).length > 0) return;

  const loaded = await loadDurableDomain<DurablePersonalMemoryState>(
    userId,
    PERSONAL_MEMORY_DOMAIN_KEY,
  );
  if (!loaded) return;

  if (loaded.settings) {
    writePersonalMemorySettings(userId, {
      ...DEFAULT_PERSONAL_MEMORY_SETTINGS,
      ...loaded.settings,
    });
  }
  if (Array.isArray(loaded.memories)) {
    replaceStoredPersonalMemories(
      userId,
      loaded.memories.filter((m) => m?.userId === userId),
    );
  }

  const store = (
    globalThis as typeof globalThis & {
      __atlasPersonalMemoryStore?: {
        correctionCounters: Map<string, DurablePersonalMemoryState["correctionCounters"]>;
        rejectedFingerprints: Map<string, Set<string>>;
      };
    }
  ).__atlasPersonalMemoryStore;

  if (store && Array.isArray(loaded.correctionCounters)) {
    store.correctionCounters.set(userId, loaded.correctionCounters);
  }
  if (store && Array.isArray(loaded.rejectedFingerprints)) {
    store.rejectedFingerprints.set(userId, new Set(loaded.rejectedFingerprints));
  }
  if (Array.isArray(loaded.qualityEvaluations)) {
    replaceQualityEvaluations(
      userId,
      loaded.qualityEvaluations.filter((row) => row?.userId === userId),
    );
  }
  if (Array.isArray(loaded.predictionHistory)) {
    replacePredictionHistory(
      userId,
      loaded.predictionHistory.filter((row) => row?.userId === userId),
    );
  }
  if (Array.isArray(loaded.dismissedSuggestionFingerprints)) {
    replaceDismissedSuggestions(
      userId,
      loaded.dismissedSuggestionFingerprints,
    );
  }
}

export function wipePersonalMemoryDurable(userId: string): void {
  clearAllPersonalMemoryData(userId);
  clearQualityEvaluations(userId);
  clearPredictStoreForUser(userId);
  getHydrated().delete(userId);
  schedulePersistPersonalMemory(userId);
}
