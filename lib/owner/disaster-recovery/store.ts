import type {
  DrBackupSnapshot,
  DrFallbackState,
  DrQueueJob,
  DrRecoveryEvent,
  DrTargetId,
} from "./types";

type DrBucket = {
  queue: DrQueueJob[];
  fallbacks: Map<DrTargetId, DrFallbackState>;
  backups: DrBackupSnapshot[];
  history: DrRecoveryEvent[];
  totalRetries: number;
};

function getBucket(): DrBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasDisasterRecoveryStore?: DrBucket;
  };
  if (!globalScope.__atlasDisasterRecoveryStore) {
    globalScope.__atlasDisasterRecoveryStore = {
      queue: [],
      fallbacks: new Map(),
      backups: [],
      history: [],
      totalRetries: 0,
    };
  }
  return globalScope.__atlasDisasterRecoveryStore;
}

export function listDrQueueJobs(): DrQueueJob[] {
  return [...getBucket().queue];
}

export function saveDrQueueJob(job: DrQueueJob): DrQueueJob {
  const bucket = getBucket();
  const idx = bucket.queue.findIndex((row) => row.id === job.id);
  if (idx >= 0) bucket.queue[idx] = job;
  else bucket.queue.unshift(job);
  if (bucket.queue.length > 300) bucket.queue.length = 300;
  return job;
}

export function getDrQueueJob(id: string): DrQueueJob | null {
  return getBucket().queue.find((row) => row.id === id) ?? null;
}

export function listDrFallbacks(): DrFallbackState[] {
  return [...getBucket().fallbacks.values()];
}

export function setDrFallback(state: DrFallbackState): DrFallbackState {
  getBucket().fallbacks.set(state.targetId, state);
  return state;
}

export function clearDrFallback(targetId: DrTargetId): void {
  getBucket().fallbacks.delete(targetId);
}

export function getDrFallback(targetId: DrTargetId): DrFallbackState | null {
  return getBucket().fallbacks.get(targetId) ?? null;
}

export function prependDrBackup(snapshot: DrBackupSnapshot): void {
  const bucket = getBucket();
  bucket.backups.unshift(snapshot);
  if (bucket.backups.length > 20) bucket.backups.length = 20;
}

export function listDrBackups(): DrBackupSnapshot[] {
  return [...getBucket().backups];
}

export function getDrBackup(id: string): DrBackupSnapshot | null {
  return getBucket().backups.find((row) => row.id === id) ?? null;
}

export function prependDrRecoveryEvent(event: DrRecoveryEvent): void {
  const bucket = getBucket();
  bucket.history.unshift(event);
  if (bucket.history.length > 500) bucket.history.length = 500;
}

export function listDrRecoveryEvents(): DrRecoveryEvent[] {
  return [...getBucket().history];
}

export function incrementDrRetryCount(): number {
  getBucket().totalRetries += 1;
  return getBucket().totalRetries;
}

export function getDrTotalRetries(): number {
  return getBucket().totalRetries;
}

export function replaceDrState(input: {
  queue?: DrQueueJob[];
  fallbacks?: DrFallbackState[];
  backups?: DrBackupSnapshot[];
  history?: DrRecoveryEvent[];
  totalRetries?: number;
}): void {
  const bucket = getBucket();
  if (input.queue) bucket.queue = [...input.queue];
  if (input.fallbacks) {
    bucket.fallbacks.clear();
    for (const row of input.fallbacks) {
      bucket.fallbacks.set(row.targetId, row);
    }
  }
  if (input.backups) bucket.backups = [...input.backups];
  if (input.history) bucket.history = [...input.history];
  if (typeof input.totalRetries === "number") {
    bucket.totalRetries = input.totalRetries;
  }
}

export function resetDisasterRecoveryStoreForTests(): void {
  const bucket = getBucket();
  bucket.queue = [];
  bucket.fallbacks.clear();
  bucket.backups = [];
  bucket.history = [];
  bucket.totalRetries = 0;
}
