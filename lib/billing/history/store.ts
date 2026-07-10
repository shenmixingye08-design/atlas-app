import type { BillingHistoryRecord } from "./types";

type HistoryBucket = BillingHistoryRecord[];

function getBucket(): HistoryBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasBillingHistoryStore?: HistoryBucket;
  };

  if (!globalScope.__atlasBillingHistoryStore) {
    globalScope.__atlasBillingHistoryStore = [];
  }

  return globalScope.__atlasBillingHistoryStore;
}

export function appendBillingHistoryRecord(
  record: BillingHistoryRecord,
): BillingHistoryRecord {
  getBucket().unshift(record);
  if (getBucket().length > 500) {
    getBucket().length = 500;
  }
  return record;
}

export function listBillingHistoryRecords(
  userId?: string,
): BillingHistoryRecord[] {
  const items = getBucket();
  if (!userId) return [...items];
  return items.filter((record) => record.userId === userId);
}

export function resetBillingHistoryStore(): void {
  getBucket().length = 0;
}
