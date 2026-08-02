import type {
  PredictionHistoryEntry,
  PredictiveApplyPreview,
  ProactiveSuggestion,
} from "@/lib/personal-memory/predict/types";

type PredictStore = {
  previews: Map<string, PredictiveApplyPreview[]>;
  history: Map<string, PredictionHistoryEntry[]>;
  dismissedSuggestions: Map<string, Set<string>>;
  suggestionShown: Map<string, number>;
  suggestionAccepted: Map<string, number>;
};

function getStore(): PredictStore {
  const g = globalThis as typeof globalThis & {
    __atlasPersonalMemoryPredictStore?: PredictStore;
  };
  if (!g.__atlasPersonalMemoryPredictStore) {
    g.__atlasPersonalMemoryPredictStore = {
      previews: new Map(),
      history: new Map(),
      dismissedSuggestions: new Map(),
      suggestionShown: new Map(),
      suggestionAccepted: new Map(),
    };
  }
  return g.__atlasPersonalMemoryPredictStore;
}

export function resetPredictStoreForTests(): void {
  const store = getStore();
  store.previews.clear();
  store.history.clear();
  store.dismissedSuggestions.clear();
  store.suggestionShown.clear();
  store.suggestionAccepted.clear();
}

export function listPredictionPreviews(
  userId: string,
): PredictiveApplyPreview[] {
  return structuredClone(getStore().previews.get(userId) ?? []);
}

export function savePredictionPreview(
  preview: PredictiveApplyPreview,
): PredictiveApplyPreview {
  const store = getStore();
  const list = store.previews.get(preview.userId) ?? [];
  list.unshift(structuredClone(preview));
  store.previews.set(preview.userId, list.slice(0, 50));
  return structuredClone(preview);
}

export function getPredictionPreview(
  userId: string,
  id: string,
): PredictiveApplyPreview | null {
  return (
    listPredictionPreviews(userId).find((p) => p.id === id) ?? null
  );
}

export function updatePredictionPreview(
  preview: PredictiveApplyPreview,
): PredictiveApplyPreview {
  const store = getStore();
  const list = store.previews.get(preview.userId) ?? [];
  const idx = list.findIndex((p) => p.id === preview.id);
  if (idx >= 0) list[idx] = structuredClone(preview);
  else list.unshift(structuredClone(preview));
  store.previews.set(preview.userId, list.slice(0, 50));
  return structuredClone(preview);
}

export function listPredictionHistory(
  userId: string,
): PredictionHistoryEntry[] {
  return structuredClone(getStore().history.get(userId) ?? []);
}

export function appendPredictionHistory(
  entry: PredictionHistoryEntry,
): void {
  const store = getStore();
  const list = store.history.get(entry.userId) ?? [];
  list.unshift(structuredClone(entry));
  store.history.set(entry.userId, list.slice(0, 300));
}

export function replacePredictionHistory(
  userId: string,
  rows: PredictionHistoryEntry[],
): void {
  getStore().history.set(
    userId,
    rows.map((r) => structuredClone(r)).slice(0, 300),
  );
}

export function replacePredictionPreviews(
  userId: string,
  rows: PredictiveApplyPreview[],
): void {
  getStore().previews.set(
    userId,
    rows.map((r) => structuredClone(r)).slice(0, 50),
  );
}

export function getDismissedSuggestionFingerprints(
  userId: string,
): Set<string> {
  return new Set(getStore().dismissedSuggestions.get(userId) ?? []);
}

export function dismissSuggestionFingerprint(
  userId: string,
  fingerprint: string,
): void {
  const store = getStore();
  const set = store.dismissedSuggestions.get(userId) ?? new Set();
  set.add(fingerprint);
  store.dismissedSuggestions.set(userId, set);
}

export function replaceDismissedSuggestions(
  userId: string,
  fingerprints: string[],
): void {
  getStore().dismissedSuggestions.set(userId, new Set(fingerprints));
}

export function listDismissedSuggestionFingerprints(
  userId: string,
): string[] {
  return [...(getStore().dismissedSuggestions.get(userId) ?? [])];
}

export function bumpSuggestionShown(userId: string, n = 1): void {
  const store = getStore();
  store.suggestionShown.set(
    userId,
    (store.suggestionShown.get(userId) ?? 0) + n,
  );
}

export function bumpSuggestionAccepted(userId: string, n = 1): void {
  const store = getStore();
  store.suggestionAccepted.set(
    userId,
    (store.suggestionAccepted.get(userId) ?? 0) + n,
  );
}

export function getSuggestionCounters(userId: string): {
  shown: number;
  accepted: number;
} {
  const store = getStore();
  return {
    shown: store.suggestionShown.get(userId) ?? 0,
    accepted: store.suggestionAccepted.get(userId) ?? 0,
  };
}

export function clearPredictStoreForUser(userId: string): void {
  const store = getStore();
  store.previews.delete(userId);
  store.history.delete(userId);
  store.dismissedSuggestions.delete(userId);
  store.suggestionShown.delete(userId);
  store.suggestionAccepted.delete(userId);
}

export type { ProactiveSuggestion };
