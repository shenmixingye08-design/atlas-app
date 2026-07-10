import type { ActivityHistoryMetadata } from "./types";

const STORAGE_KEY = "atlas-activity-history-meta";

type MetadataBucket = Record<string, ActivityHistoryMetadata>;

function readBucket(): MetadataBucket {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as MetadataBucket;
  } catch {
    return {};
  }
}

function writeBucket(bucket: MetadataBucket): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bucket));
}

export function getActivityMetadata(id: string): ActivityHistoryMetadata {
  const stored = readBucket()[id];
  return {
    favorite: stored?.favorite ?? false,
    memoryLearned: stored?.memoryLearned ?? false,
    templateId: stored?.templateId ?? null,
  };
}

export function setActivityMetadata(
  id: string,
  patch: Partial<ActivityHistoryMetadata>,
): ActivityHistoryMetadata {
  const bucket = readBucket();
  const current = getActivityMetadata(id);
  const next = { ...current, ...patch };
  bucket[id] = next;
  writeBucket(bucket);
  return next;
}

export function listActivityMetadata(): MetadataBucket {
  return readBucket();
}
