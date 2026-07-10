import type { ContactRecord } from "./types";

type ContactBucket = ContactRecord[];

function getBucket(): ContactBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasContactStore?: ContactBucket;
  };

  if (!globalScope.__atlasContactStore) {
    globalScope.__atlasContactStore = [];
  }

  return globalScope.__atlasContactStore;
}

export function saveContactRecord(record: ContactRecord): ContactRecord {
  getBucket().unshift(record);
  if (getBucket().length > 500) {
    getBucket().length = 500;
  }
  return record;
}

export function listContactRecords(limit = 50): ContactRecord[] {
  return getBucket().slice(0, limit);
}

export function resetContactStore(): void {
  getBucket().length = 0;
}
