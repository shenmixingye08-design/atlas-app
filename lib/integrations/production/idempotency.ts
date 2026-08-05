import { createHash } from "crypto";

type IdempotencyEntry = {
  key: string;
  integration: string;
  action: string;
  resultJson: string;
  createdAt: number;
};

const DEFAULT_TTL_MS = 30 * 60 * 1000;
const MAX_ENTRIES = 10_000;

function store(): Map<string, IdempotencyEntry> {
  const g = globalThis as typeof globalThis & {
    __atlasIntegrationIdempotency?: Map<string, IdempotencyEntry>;
  };
  if (!g.__atlasIntegrationIdempotency) {
    g.__atlasIntegrationIdempotency = new Map();
  }
  return g.__atlasIntegrationIdempotency;
}

export function buildIdempotencyKey(parts: {
  integration: string;
  action: string;
  userId?: string;
  fingerprint: string;
}): string {
  const raw = [
    parts.integration,
    parts.action,
    parts.userId ?? "",
    parts.fingerprint,
  ].join("|");
  return createHash("sha256").update(raw).digest("hex");
}

function prune(now: number, ttlMs: number): void {
  const map = store();
  for (const [key, entry] of map) {
    if (now - entry.createdAt > ttlMs) map.delete(key);
  }
  if (map.size > MAX_ENTRIES) {
    const ordered = [...map.entries()].sort(
      (a, b) => a[1].createdAt - b[1].createdAt,
    );
    const removeCount = map.size - MAX_ENTRIES;
    for (let i = 0; i < removeCount; i += 1) {
      const key = ordered[i]?.[0];
      if (key) map.delete(key);
    }
  }
}

export function getIdempotentResult<T>(
  key: string,
  options?: { ttlMs?: number },
): T | null {
  const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
  const now = Date.now();
  prune(now, ttlMs);
  const entry = store().get(key);
  if (!entry) return null;
  if (now - entry.createdAt > ttlMs) {
    store().delete(key);
    return null;
  }
  try {
    return JSON.parse(entry.resultJson) as T;
  } catch {
    store().delete(key);
    return null;
  }
}

export function saveIdempotentResult(input: {
  key: string;
  integration: string;
  action: string;
  result: unknown;
  ttlMs?: number;
}): void {
  const ttlMs = input.ttlMs ?? DEFAULT_TTL_MS;
  const now = Date.now();
  prune(now, ttlMs);
  store().set(input.key, {
    key: input.key,
    integration: input.integration,
    action: input.action,
    resultJson: JSON.stringify(input.result),
    createdAt: now,
  });
}

export function resetIntegrationIdempotencyForTests(): void {
  const g = globalThis as typeof globalThis & {
    __atlasIntegrationIdempotency?: Map<string, IdempotencyEntry>;
  };
  g.__atlasIntegrationIdempotency = new Map();
}
