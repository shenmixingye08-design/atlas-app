import type { Deliverable, DeliverableFormat } from "./types";

export type GenerationAttemptKey = {
  jobId: string;
  userId: string;
  format: DeliverableFormat;
  generationAttempt?: number;
};

export type IdempotentGenerationRecord = {
  key: string;
  status: "running" | "completed" | "failed";
  deliverable: Deliverable | null;
  failureReasons: string[];
  createdAt: string;
  updatedAt: string;
};

type Bucket = Map<string, IdempotentGenerationRecord>;
type LockBucket = Map<string, Promise<unknown>>;

function getRecords(): Bucket {
  const scope = globalThis as typeof globalThis & {
    __minervotDeliverableIdempotency?: Bucket;
  };
  if (!scope.__minervotDeliverableIdempotency) {
    scope.__minervotDeliverableIdempotency = new Map();
  }
  return scope.__minervotDeliverableIdempotency;
}

function getLocks(): LockBucket {
  const scope = globalThis as typeof globalThis & {
    __minervotDeliverableLocks?: LockBucket;
  };
  if (!scope.__minervotDeliverableLocks) {
    scope.__minervotDeliverableLocks = new Map();
  }
  return scope.__minervotDeliverableLocks;
}

export function buildGenerationIdempotencyKey(
  input: GenerationAttemptKey,
): string {
  const attempt = input.generationAttempt ?? 1;
  return `gen:${input.userId}:${input.jobId}:${input.format}:a${attempt}`;
}

export function getIdempotentGeneration(
  key: string,
): IdempotentGenerationRecord | null {
  return getRecords().get(key) ?? null;
}

export function markGenerationRunning(key: string): IdempotentGenerationRecord {
  const now = new Date().toISOString();
  const existing = getRecords().get(key);
  if (existing?.status === "completed" && existing.deliverable) {
    return existing;
  }
  const record: IdempotentGenerationRecord = {
    key,
    status: "running",
    deliverable: existing?.status === "failed" ? null : existing?.deliverable ?? null,
    failureReasons: [],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  getRecords().set(key, record);
  return record;
}

export function markGenerationCompleted(
  key: string,
  deliverable: Deliverable,
): IdempotentGenerationRecord {
  const now = new Date().toISOString();
  const existing = getRecords().get(key);
  const record: IdempotentGenerationRecord = {
    key,
    status: "completed",
    deliverable,
    failureReasons: [],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  getRecords().set(key, record);
  return record;
}

export function markGenerationFailed(
  key: string,
  reasons: string[],
): IdempotentGenerationRecord {
  const now = new Date().toISOString();
  const existing = getRecords().get(key);
  const record: IdempotentGenerationRecord = {
    key,
    status: "failed",
    deliverable: null,
    failureReasons: reasons,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  getRecords().set(key, record);
  return record;
}

/**
 * Serialize concurrent generators for the same key.
 * Completed success short-circuits; failed allows regenerate.
 */
export async function withGenerationLock<T>(
  key: string,
  run: () => Promise<T>,
): Promise<T> {
  const locks = getLocks();
  const previous = locks.get(key) ?? Promise.resolve();
  let resolveCurrent!: () => void;
  const current = new Promise<void>((resolve) => {
    resolveCurrent = resolve;
  });
  const tail = previous
    .catch(() => undefined)
    .then(() => current);
  locks.set(key, tail);
  await previous.catch(() => undefined);
  try {
    return await run();
  } finally {
    resolveCurrent();
  }
}

export function resetDeliverableIdempotencyForTests(): void {
  getRecords().clear();
  getLocks().clear();
}
