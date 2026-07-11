import { randomUUID } from "crypto";

type DropboxOAuthStateEntry = {
  createdAt: number;
  userId: string;
  codeVerifier: string;
};

type DropboxOAuthStateBucket = Map<string, DropboxOAuthStateEntry>;

const STATE_TTL_MS = 1000 * 60 * 10;

function getStateBucket(): DropboxOAuthStateBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasDropboxOAuthStateStore?: DropboxOAuthStateBucket;
  };

  if (!globalScope.__atlasDropboxOAuthStateStore) {
    globalScope.__atlasDropboxOAuthStateStore = new Map();
  }

  return globalScope.__atlasDropboxOAuthStateStore;
}

function purgeExpiredStates(bucket: DropboxOAuthStateBucket): void {
  const cutoff = Date.now() - STATE_TTL_MS;
  for (const [state, entry] of bucket.entries()) {
    if (entry.createdAt < cutoff) bucket.delete(state);
  }
}

export function createDropboxOAuthState(
  userId: string,
  codeVerifier: string,
): string {
  const bucket = getStateBucket();
  purgeExpiredStates(bucket);

  const state = randomUUID();
  bucket.set(state, { createdAt: Date.now(), userId, codeVerifier });
  return state;
}

export function consumeDropboxOAuthState(state: string): {
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

export function resetDropboxOAuthStateStore(): void {
  getStateBucket().clear();
}
