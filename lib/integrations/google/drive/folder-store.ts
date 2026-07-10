import "server-only";

import type { DriveCategoryId } from "./types";

export type StoredDriveFolders = {
  userId: string;
  rootFolderId: string;
  categories: Record<DriveCategoryId, string>;
  ensuredAt: string;
};

type FolderStore = Map<string, StoredDriveFolders>;

function getStore(): FolderStore {
  const globalScope = globalThis as typeof globalThis & {
    __atlasGoogleDriveFolderStore?: FolderStore;
  };

  if (!globalScope.__atlasGoogleDriveFolderStore) {
    globalScope.__atlasGoogleDriveFolderStore = new Map();
  }

  return globalScope.__atlasGoogleDriveFolderStore;
}

export function getStoredDriveFolders(
  userId: string,
): StoredDriveFolders | null {
  return getStore().get(userId) ?? null;
}

export function saveStoredDriveFolders(record: StoredDriveFolders): void {
  getStore().set(record.userId, record);
}

export function resetDriveFolderStore(): void {
  getStore().clear();
}
