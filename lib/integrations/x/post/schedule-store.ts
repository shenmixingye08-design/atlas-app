import "server-only";

import type { XScheduledPost } from "./types";

type ScheduleStore = XScheduledPost[];

function getBucket(): ScheduleStore {
  const globalScope = globalThis as typeof globalThis & {
    __atlasXScheduledPostsStore?: ScheduleStore;
  };

  if (!globalScope.__atlasXScheduledPostsStore) {
    globalScope.__atlasXScheduledPostsStore = [];
  }

  return globalScope.__atlasXScheduledPostsStore;
}

export function listXScheduledPosts(userId?: string): XScheduledPost[] {
  const items = getBucket();
  if (!userId) return [...items];
  return items.filter((item) => item.userId === userId);
}

export function listDueXScheduledPosts(now = new Date()): XScheduledPost[] {
  const nowMs = now.getTime();
  return getBucket().filter(
    (item) =>
      item.status === "pending" &&
      new Date(item.scheduledFor).getTime() <= nowMs,
  );
}

export function saveXScheduledPost(input: {
  userId: string;
  text: string;
  scheduledFor: string;
  automationId?: string | null;
}): XScheduledPost {
  const post: XScheduledPost = {
    id: crypto.randomUUID(),
    userId: input.userId,
    text: input.text.trim(),
    scheduledFor: input.scheduledFor,
    automationId: input.automationId ?? null,
    createdAt: new Date().toISOString(),
    status: "pending",
    errorMessage: null,
  };

  getBucket().unshift(post);
  return post;
}

export function updateXScheduledPost(
  id: string,
  patch: Partial<Pick<XScheduledPost, "status" | "errorMessage">>,
): XScheduledPost | null {
  const bucket = getBucket();
  const index = bucket.findIndex((item) => item.id === id);
  if (index < 0) return null;

  const updated: XScheduledPost = {
    ...bucket[index]!,
    ...patch,
  };
  bucket[index] = updated;
  return updated;
}

export function resetXScheduledPostsStore(): void {
  const globalScope = globalThis as typeof globalThis & {
    __atlasXScheduledPostsStore?: ScheduleStore;
  };
  globalScope.__atlasXScheduledPostsStore = [];
}
