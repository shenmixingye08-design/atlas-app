import "server-only";

import type { GmailReplyDraftContent, GmailSavedReplyDraft } from "./types";

type ReplyDraftStore = Map<string, GmailSavedReplyDraft[]>;

function getStore(): ReplyDraftStore {
  const globalScope = globalThis as typeof globalThis & {
    __atlasGmailReplyDraftStore?: ReplyDraftStore;
  };

  if (!globalScope.__atlasGmailReplyDraftStore) {
    globalScope.__atlasGmailReplyDraftStore = new Map();
  }

  return globalScope.__atlasGmailReplyDraftStore;
}

function userKey(userId: string): string {
  return userId;
}

export function listGmailReplyDrafts(userId: string): GmailSavedReplyDraft[] {
  return [...(getStore().get(userKey(userId)) ?? [])].sort(
    (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
  );
}

export function saveGmailReplyDraft(
  userId: string,
  draft: GmailReplyDraftContent,
): GmailSavedReplyDraft {
  const bucket = getStore().get(userKey(userId)) ?? [];
  const now = new Date().toISOString();
  const existingIndex = bucket.findIndex(
    (item) => item.messageId === draft.messageId,
  );

  const record: GmailSavedReplyDraft = {
    ...draft,
    id:
      existingIndex >= 0
        ? bucket[existingIndex]!.id
        : `gmail_draft_${crypto.randomUUID()}`,
    userId,
    savedAt: now,
  };

  if (existingIndex >= 0) {
    bucket[existingIndex] = record;
  } else {
    bucket.unshift(record);
  }

  getStore().set(userKey(userId), bucket.slice(0, 50));
  return record;
}

export function resetGmailReplyDraftStore(): void {
  getStore().clear();
}
