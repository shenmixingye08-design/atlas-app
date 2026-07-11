import type { AccountDeletionRecord } from "./types";

type DeletionBucket = Map<string, AccountDeletionRecord>;

function getBucket(): DeletionBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasAccountDeletionStore?: DeletionBucket;
  };
  if (!globalScope.__atlasAccountDeletionStore) {
    globalScope.__atlasAccountDeletionStore = new Map();
  }
  return globalScope.__atlasAccountDeletionStore;
}

export function getAccountDeletionRecord(
  userId: string,
): AccountDeletionRecord | null {
  return getBucket().get(userId) ?? null;
}

export function saveAccountDeletionRecord(
  record: AccountDeletionRecord,
): AccountDeletionRecord {
  getBucket().set(record.userId, record);
  return record;
}

export function deleteAccountDeletionRecord(userId: string): boolean {
  return getBucket().delete(userId);
}

export function listAccountDeletionRecords(): AccountDeletionRecord[] {
  return [...getBucket().values()].sort(
    (a, b) =>
      new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime(),
  );
}

export function resetAccountDeletionStore(): void {
  getBucket().clear();
}
