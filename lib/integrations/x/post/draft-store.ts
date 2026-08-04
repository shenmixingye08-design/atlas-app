import "server-only";

import {
  getDurableXDraft,
  listDurableXDrafts,
  resetDurableXDraftsForTests,
  softDeleteDurableXDraft,
  upsertDurableXDraft,
} from "./durable-x-drafts";
import type { XDraftPost } from "./types";

/**
 * P0-5: draft-store is a thin façade over durable X drafts.
 * Production never uses module-level Map as SoT.
 */

export async function listXDraftPosts(userId: string): Promise<XDraftPost[]> {
  if (!userId.trim()) return [];
  return listDurableXDrafts(userId);
}

export async function getXDraftPost(
  userId: string,
  draftId: string,
): Promise<XDraftPost | null> {
  return getDurableXDraft({ ownerId: userId, draftId });
}

export async function saveXDraftPost(input: {
  userId: string;
  text: string;
  id?: string;
  expectedVersion?: number;
}): Promise<XDraftPost> {
  return upsertDurableXDraft({
    ownerId: input.userId,
    content: input.text,
    draftId: input.id,
    expectedVersion: input.expectedVersion,
  });
}

export async function deleteXDraftPost(
  userId: string,
  draftId: string,
): Promise<boolean> {
  return softDeleteDurableXDraft({ ownerId: userId, draftId });
}

export function resetXDraftPostStore(): void {
  resetDurableXDraftsForTests();
}
