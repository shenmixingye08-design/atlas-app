/**
 * Measured ROI from first-value completions.
 * Distinct from estimates — only written after a real deliverable path.
 */

const STORAGE_KEY = "atlas.firstValue.measured.v1";

export type FirstValueMeasuredRecord = {
  jobId: string;
  candidateLabel: string;
  title: string;
  minutesSaved: number;
  completedAt: string;
  deliverableId: string | null;
  automationId: string | null;
  downloadedAt: string | null;
};

export type FirstValueMeasuredState = {
  records: FirstValueMeasuredRecord[];
};

function empty(): FirstValueMeasuredState {
  return { records: [] };
}

function memoryBucket(): FirstValueMeasuredState {
  const g = globalThis as typeof globalThis & {
    __atlasFirstValueMeasured?: FirstValueMeasuredState;
  };
  if (!g.__atlasFirstValueMeasured) g.__atlasFirstValueMeasured = empty();
  return g.__atlasFirstValueMeasured;
}

function read(): FirstValueMeasuredState {
  if (typeof window === "undefined") {
    return { records: [...memoryBucket().records] };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { records: [...memoryBucket().records] };
    const parsed = JSON.parse(raw) as FirstValueMeasuredState;
    return { records: Array.isArray(parsed.records) ? parsed.records : [] };
  } catch {
    return { records: [...memoryBucket().records] };
  }
}

function write(state: FirstValueMeasuredState): void {
  memoryBucket().records = state.records;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function resetFirstValueMeasuredForTests(): void {
  const g = globalThis as typeof globalThis & {
    __atlasFirstValueMeasured?: FirstValueMeasuredState;
  };
  g.__atlasFirstValueMeasured = empty();
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

export function listFirstValueMeasured(): FirstValueMeasuredRecord[] {
  return read().records;
}

export function hasFirstValueCompletion(): boolean {
  return read().records.length > 0;
}

export function recordFirstValueMeasured(
  input: Omit<FirstValueMeasuredRecord, "downloadedAt"> & {
    downloadedAt?: string | null;
  },
): void {
  const state = read();
  if (state.records.some((r) => r.jobId === input.jobId)) return;
  state.records.unshift({
    ...input,
    downloadedAt: input.downloadedAt ?? null,
  });
  state.records = state.records.slice(0, 100);
  write(state);
}

export function markFirstValueDownloaded(jobId: string): void {
  const state = read();
  const row = state.records.find((r) => r.jobId === jobId);
  if (!row || row.downloadedAt) return;
  row.downloadedAt = new Date().toISOString();
  write(state);
}

function sumMinutes(
  records: FirstValueMeasuredRecord[],
  sinceMs: number,
): number | null {
  const total = records
    .filter((r) => Date.parse(r.completedAt) >= sinceMs)
    .reduce((sum, r) => sum + Math.max(0, r.minutesSaved), 0);
  return total > 0 ? total : null;
}

/** Measured minutes for today / week / month (null when none). */
export function getMeasuredMinutesSlices(nowMs = Date.now()): {
  today: number | null;
  week: number | null;
  month: number | null;
  completedCount: number;
} {
  const records = read().records;
  const startOfDay = new Date(nowMs);
  startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfDay);
  const day = startOfWeek.getDay();
  startOfWeek.setDate(startOfWeek.getDate() - (day === 0 ? 6 : day - 1));
  const startOfMonth = new Date(startOfDay.getFullYear(), startOfDay.getMonth(), 1);

  return {
    today: sumMinutes(records, startOfDay.getTime()),
    week: sumMinutes(records, startOfWeek.getTime()),
    month: sumMinutes(records, startOfMonth.getTime()),
    completedCount: records.length,
  };
}
