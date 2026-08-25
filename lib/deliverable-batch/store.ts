import type {
  DeliverableBatch,
  DeliverableBatchItem,
  DeliverableBatchWithItems,
} from "./types";

type Bucket = {
  batches: Map<string, DeliverableBatch>;
  items: Map<string, DeliverableBatchItem>;
};

function bucket(): Bucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasDeliverableBatchStore?: Bucket;
  };
  if (!globalScope.__atlasDeliverableBatchStore) {
    globalScope.__atlasDeliverableBatchStore = {
      batches: new Map(),
      items: new Map(),
    };
  }
  return globalScope.__atlasDeliverableBatchStore;
}

export function resetDeliverableBatchStoreForTests(): void {
  const store = bucket();
  store.batches.clear();
  store.items.clear();
}

export function writeDeliverableBatch(batch: DeliverableBatch): void {
  bucket().batches.set(`${batch.userId}:${batch.id}`, batch);
}

export function writeDeliverableBatchItem(item: DeliverableBatchItem): void {
  bucket().items.set(`${item.userId}:${item.id}`, item);
}

export function deleteDeliverableBatchItemRecord(
  userId: string,
  itemId: string,
): void {
  bucket().items.delete(`${userId}:${itemId}`);
}

export function readDeliverableBatch(
  userId: string,
  batchId: string,
): DeliverableBatch | null {
  return bucket().batches.get(`${userId}:${batchId}`) ?? null;
}

export function readDeliverableBatchItem(
  userId: string,
  itemId: string,
): DeliverableBatchItem | null {
  return bucket().items.get(`${userId}:${itemId}`) ?? null;
}

export function listDeliverableBatches(userId: string): DeliverableBatch[] {
  return [...bucket().batches.values()]
    .filter((batch) => batch.userId === userId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function listDeliverableBatchItems(
  userId: string,
  batchId: string,
): DeliverableBatchItem[] {
  return [...bucket().items.values()]
    .filter((item) => item.userId === userId && item.batchId === batchId)
    .sort((a, b) => a.order - b.order);
}

export function readDeliverableBatchWithItems(
  userId: string,
  batchId: string,
): DeliverableBatchWithItems | null {
  const batch = readDeliverableBatch(userId, batchId);
  if (!batch) return null;
  return { batch, items: listDeliverableBatchItems(userId, batchId) };
}

export function countGeneratingBatches(userId: string): number {
  return listDeliverableBatches(userId).filter((batch) =>
    batch.status === "generating" || batch.status === "generating_sample",
  ).length;
}

export function replaceUserDeliverableBatches(
  userId: string,
  batches: DeliverableBatch[],
  items: DeliverableBatchItem[],
): void {
  const store = bucket();
  for (const key of [...store.batches.keys()]) {
    if (key.startsWith(`${userId}:`)) store.batches.delete(key);
  }
  for (const key of [...store.items.keys()]) {
    if (key.startsWith(`${userId}:`)) store.items.delete(key);
  }
  for (const batch of batches) {
    if (batch.userId === userId) writeDeliverableBatch(batch);
  }
  for (const item of items) {
    if (item.userId === userId) writeDeliverableBatchItem(item);
  }
}
