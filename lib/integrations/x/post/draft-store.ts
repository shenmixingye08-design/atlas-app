import "server-only";

import type { XDraftPost } from "./types";

type DraftStore = Map<string, XDraftPost[]>;

function getStore(): DraftStore {
  const globalScope = globalThis as typeof globalThis & {
    __atlasXDraftPostStore?: DraftStore;
  };

  if (!globalScope.__atlasXDraftPostStore) {
    globalScope.__atlasXDraftPostStore = new Map();
  }

  return globalScope.__atlasXDraftPostStore;
}

function userKey(userId: string): string {
  return userId;
}

export function listXDraftPosts(userId: string): XDraftPost[] {
  return [...(getStore().get(userKey(userId)) ?? [])].sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export function getXDraftPost(
  userId: string,
  draftId: string,
): XDraftPost | null {
  return (
    listXDraftPosts(userId).find((draft) => draft.id === draftId) ?? null
  );
}

export function saveXDraftPost(input: {
  userId: string;
  text: string;
  id?: string;
}): XDraftPost {
  const now = new Date().toISOString();
  const bucket = getStore().get(userKey(input.userId)) ?? [];
  const existingIndex = input.id
    ? bucket.findIndex((draft) => draft.id === input.id)
    : -1;

  if (existingIndex >= 0) {
    const updated: XDraftPost = {
      ...bucket[existingIndex]!,
      text: input.text.trim(),
      updatedAt: now,
    };
    bucket[existingIndex] = updated;
    getStore().set(userKey(input.userId), bucket);
    return updated;
  }

  const draft: XDraftPost = {
    id: crypto.randomUUID(),
    userId: input.userId,
    text: input.text.trim(),
    createdAt: now,
    updatedAt: now,
  };
  bucket.unshift(draft);
  getStore().set(userKey(input.userId), bucket);
  return draft;
}

export function deleteXDraftPost(userId: string, draftId: string): boolean {
  const bucket = getStore().get(userKey(userId)) ?? [];
  const next = bucket.filter((draft) => draft.id !== draftId);
  if (next.length === bucket.length) return false;
  getStore().set(userKey(userId), next);
  return true;
}

export function resetXDraftPostStore(): void {
  const globalScope = globalThis as typeof globalThis & {
    __atlasXDraftPostStore?: DraftStore;
  };
  globalScope.__atlasXDraftPostStore = new Map();
}
