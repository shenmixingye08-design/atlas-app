import "server-only";

import type { XPostHistoryRecord } from "./types";

type HistoryStore = Map<string, XPostHistoryRecord[]>;

function getStore(): HistoryStore {
  const globalScope = globalThis as typeof globalThis & {
    __atlasXPostHistoryStore?: HistoryStore;
  };

  if (!globalScope.__atlasXPostHistoryStore) {
    globalScope.__atlasXPostHistoryStore = new Map();
  }

  return globalScope.__atlasXPostHistoryStore;
}

function userKey(userId: string): string {
  return userId;
}

export function listXPostHistory(userId: string): XPostHistoryRecord[] {
  return [...(getStore().get(userKey(userId)) ?? [])].sort(
    (a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime(),
  );
}

export function saveXPostHistoryRecord(record: XPostHistoryRecord): XPostHistoryRecord {
  const bucket = getStore().get(userKey(record.userId)) ?? [];
  bucket.unshift(record);
  getStore().set(userKey(record.userId), bucket);
  return record;
}

export function resetXPostHistoryStore(): void {
  const globalScope = globalThis as typeof globalThis & {
    __atlasXPostHistoryStore?: HistoryStore;
  };
  globalScope.__atlasXPostHistoryStore = new Map();
}
