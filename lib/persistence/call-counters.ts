/**
 * In-process counters for persistence reliability E2E / diagnostics.
 * Never includes secrets or payloads.
 */

export type PersistenceCounterSnapshot = {
  clerkGetUser: number;
  clerkUpdateMetadata: number;
  clerkClearKeys: number;
  supabaseUserStateUpsert: number;
  supabaseUserStateLoad: number;
  notificationCreate: number;
  workMemoryPersist: number;
  learningPersist: number;
  commanderPersist: number;
  workJobPersist: number;
  processCwdDataDirAttempts: number;
  processCwdDataDirBlocked: number;
  clerk8kbErrors: number;
  clerk429Errors: number;
};

const zero = (): PersistenceCounterSnapshot => ({
  clerkGetUser: 0,
  clerkUpdateMetadata: 0,
  clerkClearKeys: 0,
  supabaseUserStateUpsert: 0,
  supabaseUserStateLoad: 0,
  notificationCreate: 0,
  workMemoryPersist: 0,
  learningPersist: 0,
  commanderPersist: 0,
  workJobPersist: 0,
  processCwdDataDirAttempts: 0,
  processCwdDataDirBlocked: 0,
  clerk8kbErrors: 0,
  clerk429Errors: 0,
});

let counters = zero();

export function resetPersistenceCounters(): void {
  counters = zero();
}

export function bumpPersistenceCounter(
  key: keyof PersistenceCounterSnapshot,
  by = 1,
): void {
  counters[key] += by;
}

export function getPersistenceCounters(): PersistenceCounterSnapshot {
  return { ...counters };
}

export function recordClerkErrorMessage(message: string): void {
  if (/8192|8 KB|maximum allowed size|private_metadata/i.test(message)) {
    bumpPersistenceCounter("clerk8kbErrors");
  }
  if (/429|Too Many Requests|rate.?limit/i.test(message)) {
    bumpPersistenceCounter("clerk429Errors");
  }
}
