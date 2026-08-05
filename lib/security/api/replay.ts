import { createHash } from "crypto";

type ReplayEntry = { seenAt: number };

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 20_000;

function store(): Map<string, ReplayEntry> {
  const g = globalThis as typeof globalThis & {
    __atlasApiReplayGuard?: Map<string, ReplayEntry>;
  };
  if (!g.__atlasApiReplayGuard) g.__atlasApiReplayGuard = new Map();
  return g.__atlasApiReplayGuard;
}

function prune(now: number, ttlMs: number): void {
  const map = store();
  for (const [key, entry] of map) {
    if (now - entry.seenAt > ttlMs) map.delete(key);
  }
  if (map.size > MAX_ENTRIES) {
    const ordered = [...map.entries()].sort(
      (a, b) => a[1].seenAt - b[1].seenAt,
    );
    const remove = map.size - MAX_ENTRIES;
    for (let i = 0; i < remove; i += 1) {
      const key = ordered[i]?.[0];
      if (key) map.delete(key);
    }
  }
}

export function buildReplayKey(parts: {
  userId: string;
  method: string;
  path: string;
  idempotencyKey?: string | null;
  bodyFingerprint?: string | null;
}): string {
  const raw = [
    parts.userId,
    parts.method.toUpperCase(),
    parts.path,
    parts.idempotencyKey ?? "",
    parts.bodyFingerprint ?? "",
  ].join("|");
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Reject duplicate mutating requests that reuse the same Idempotency-Key
 * (or body fingerprint) within TTL after a successful acceptance.
 */
export function assertNotReplay(input: {
  key: string;
  ttlMs?: number;
}): { ok: true } | { ok: false; reason: string } {
  const ttlMs = input.ttlMs ?? DEFAULT_TTL_MS;
  const now = Date.now();
  prune(now, ttlMs);
  const existing = store().get(input.key);
  if (existing && now - existing.seenAt <= ttlMs) {
    return { ok: false, reason: "重複リクエストは拒否されました" };
  }
  return { ok: true };
}

export function markReplaySeen(key: string): void {
  prune(Date.now(), DEFAULT_TTL_MS);
  store().set(key, { seenAt: Date.now() });
}

export function resetReplayGuardForTests(): void {
  const g = globalThis as typeof globalThis & {
    __atlasApiReplayGuard?: Map<string, ReplayEntry>;
  };
  g.__atlasApiReplayGuard = new Map();
}
