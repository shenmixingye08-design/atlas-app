import "server-only";

import type { WordPressCredentialRecord } from "./types";

type CredentialBucket = Map<string, WordPressCredentialRecord>;

function getBucket(): CredentialBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasWordPressCredentialStore?: CredentialBucket;
  };

  if (!globalScope.__atlasWordPressCredentialStore) {
    globalScope.__atlasWordPressCredentialStore = new Map();
  }

  return globalScope.__atlasWordPressCredentialStore;
}

export function getWordPressCredentials(
  userId: string,
): WordPressCredentialRecord | null {
  return getBucket().get(userId) ?? null;
}

export function saveWordPressCredentials(
  record: WordPressCredentialRecord,
): WordPressCredentialRecord {
  getBucket().set(record.userId, record);
  return record;
}

export function deleteWordPressCredentials(userId: string): boolean {
  return getBucket().delete(userId);
}

/** Test helper. */
export function resetWordPressCredentialStore(): void {
  getBucket().clear();
}
