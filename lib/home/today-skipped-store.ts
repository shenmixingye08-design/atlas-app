"use client";

const STORAGE_KEY = "atlas-today-skipped-jobs";

type SkippedStore = {
  dateKey: string;
  automationIds: string[];
  projectIds: string[];
};

function todayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function loadStore(): SkippedStore {
  if (typeof window === "undefined") {
    return { dateKey: todayKey(), automationIds: [], projectIds: [] };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { dateKey: todayKey(), automationIds: [], projectIds: [] };
    const parsed = JSON.parse(raw) as SkippedStore;
    if (parsed.dateKey !== todayKey()) {
      return { dateKey: todayKey(), automationIds: [], projectIds: [] };
    }
    return {
      dateKey: parsed.dateKey,
      automationIds: Array.isArray(parsed.automationIds) ? parsed.automationIds : [],
      projectIds: Array.isArray(parsed.projectIds) ? parsed.projectIds : [],
    };
  } catch {
    return { dateKey: todayKey(), automationIds: [], projectIds: [] };
  }
}

function saveStore(store: SkippedStore): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function isAutomationSkippedToday(
  automationId: string,
  now: Date = new Date(),
): boolean {
  const store = loadStore();
  if (store.dateKey !== todayKey(now)) return false;
  return store.automationIds.includes(automationId);
}

export function isProjectSkippedToday(projectId: string, now: Date = new Date()): boolean {
  const store = loadStore();
  if (store.dateKey !== todayKey(now)) return false;
  return store.projectIds.includes(projectId);
}

export function skipAutomationToday(automationId: string): void {
  const store = loadStore();
  const next = {
    dateKey: todayKey(),
    automationIds: store.automationIds.includes(automationId)
      ? store.automationIds
      : [...store.automationIds, automationId],
    projectIds: store.projectIds,
  };
  saveStore(next);
}

export function skipProjectToday(projectId: string): void {
  const store = loadStore();
  const next = {
    dateKey: todayKey(),
    automationIds: store.automationIds,
    projectIds: store.projectIds.includes(projectId)
      ? store.projectIds
      : [...store.projectIds, projectId],
  };
  saveStore(next);
}

export function getSkippedAutomationIds(): string[] {
  return loadStore().automationIds;
}

export function getSkippedProjectIds(): string[] {
  return loadStore().projectIds;
}
