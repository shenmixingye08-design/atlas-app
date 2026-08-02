import type { DeliverableQualityEvaluation } from "@/lib/personal-memory/quality/types";

type QualityStore = {
  evaluations: Map<string, DeliverableQualityEvaluation[]>;
};

function getStore(): QualityStore {
  const g = globalThis as typeof globalThis & {
    __atlasPersonalMemoryQualityStore?: QualityStore;
  };
  if (!g.__atlasPersonalMemoryQualityStore) {
    g.__atlasPersonalMemoryQualityStore = {
      evaluations: new Map(),
    };
  }
  return g.__atlasPersonalMemoryQualityStore;
}

export function resetMemoryQualityStoreForTests(): void {
  getStore().evaluations.clear();
}

export function listQualityEvaluations(
  userId: string,
): DeliverableQualityEvaluation[] {
  return structuredClone(getStore().evaluations.get(userId) ?? []);
}

export function upsertQualityEvaluation(
  row: DeliverableQualityEvaluation,
): DeliverableQualityEvaluation {
  const store = getStore();
  const list = store.evaluations.get(row.userId) ?? [];
  const idx = list.findIndex((r) => r.id === row.id);
  if (idx >= 0) list[idx] = structuredClone(row);
  else list.unshift(structuredClone(row));
  // Keep last 200
  store.evaluations.set(row.userId, list.slice(0, 200));
  return structuredClone(row);
}

export function replaceQualityEvaluations(
  userId: string,
  rows: DeliverableQualityEvaluation[],
): void {
  getStore().evaluations.set(
    userId,
    rows.map((r) => structuredClone(r)).slice(0, 200),
  );
}

export function clearQualityEvaluations(userId: string): void {
  getStore().evaluations.delete(userId);
}
