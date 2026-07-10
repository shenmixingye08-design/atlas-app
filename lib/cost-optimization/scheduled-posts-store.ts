import type { ScheduledPostDraft, SnsBatchDays } from "./sns-batch";

function getBucket(): ScheduledPostDraft[] {
  const globalScope = globalThis as typeof globalThis & {
    __atlasScheduledPostsStore?: ScheduledPostDraft[];
  };
  if (!globalScope.__atlasScheduledPostsStore) {
    globalScope.__atlasScheduledPostsStore = [];
  }
  return globalScope.__atlasScheduledPostsStore;
}

export function saveScheduledPostDraft(input: {
  automationId: string;
  automationName: string;
  batchDays: SnsBatchDays;
  content: string;
}): ScheduledPostDraft {
  const draft: ScheduledPostDraft = {
    id: crypto.randomUUID(),
    automationId: input.automationId,
    automationName: input.automationName,
    batchDays: input.batchDays,
    content: input.content,
    scheduledFor: null,
    createdAt: new Date().toISOString(),
  };
  getBucket().unshift(draft);
  return draft;
}

export function listScheduledPostDrafts(
  automationId?: string,
): ScheduledPostDraft[] {
  const items = getBucket();
  if (!automationId) return [...items];
  return items.filter((item) => item.automationId === automationId);
}
