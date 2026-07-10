import { randomUUID } from "crypto";

type OAuthStateEntry = {
  createdAt: number;
  userId: string;
};

type OAuthStateBucket = Map<string, OAuthStateEntry>;

const STATE_TTL_MS = 1000 * 60 * 10;

function getStateBucket(): OAuthStateBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasGoogleOAuthStateStore?: OAuthStateBucket;
  };

  if (!globalScope.__atlasGoogleOAuthStateStore) {
    globalScope.__atlasGoogleOAuthStateStore = new Map();
  }

  return globalScope.__atlasGoogleOAuthStateStore;
}

function purgeExpiredStates(bucket: OAuthStateBucket): void {
  const cutoff = Date.now() - STATE_TTL_MS;
  for (const [state, entry] of bucket.entries()) {
    if (entry.createdAt < cutoff) bucket.delete(state);
  }
}

export function createOAuthState(userId: string): string {
  const bucket = getStateBucket();
  purgeExpiredStates(bucket);

  const state = randomUUID();
  bucket.set(state, { createdAt: Date.now(), userId });
  return state;
}

export function consumeOAuthState(state: string): { userId: string } | null {
  const bucket = getStateBucket();
  purgeExpiredStates(bucket);

  const entry = bucket.get(state);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > STATE_TTL_MS) {
    bucket.delete(state);
    return null;
  }

  bucket.delete(state);
  return { userId: entry.userId };
}

export function resetOAuthStateStore(): void {
  getStateBucket().clear();
}
