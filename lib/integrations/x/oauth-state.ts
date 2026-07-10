import { randomUUID } from "crypto";

type XOAuthStateEntry = {
  createdAt: number;
  userId: string;
  codeVerifier: string;
};

type XOAuthStateBucket = Map<string, XOAuthStateEntry>;

const STATE_TTL_MS = 1000 * 60 * 10;

function getStateBucket(): XOAuthStateBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasXOAuthStateStore?: XOAuthStateBucket;
  };

  if (!globalScope.__atlasXOAuthStateStore) {
    globalScope.__atlasXOAuthStateStore = new Map();
  }

  return globalScope.__atlasXOAuthStateStore;
}

function purgeExpiredStates(bucket: XOAuthStateBucket): void {
  const cutoff = Date.now() - STATE_TTL_MS;
  for (const [state, entry] of bucket.entries()) {
    if (entry.createdAt < cutoff) bucket.delete(state);
  }
}

export function createXOAuthState(
  userId: string,
  codeVerifier: string,
): string {
  const bucket = getStateBucket();
  purgeExpiredStates(bucket);

  const state = randomUUID();
  bucket.set(state, { createdAt: Date.now(), userId, codeVerifier });
  return state;
}

export function consumeXOAuthState(state: string): {
  userId: string;
  codeVerifier: string;
} | null {
  const bucket = getStateBucket();
  purgeExpiredStates(bucket);

  const entry = bucket.get(state);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > STATE_TTL_MS) {
    bucket.delete(state);
    return null;
  }

  bucket.delete(state);
  return { userId: entry.userId, codeVerifier: entry.codeVerifier };
}

export function resetXOAuthStateStore(): void {
  getStateBucket().clear();
}
