import "server-only";

import {
  cancelDurableXPostJob,
  claimDueXPostJobs,
  insertDurableXPostJob,
  jobToLegacyScheduled,
  listDurableXPostJobs,
  resetDurableXPostJobsForTests,
  transitionDurableXPostJob,
  type DurableXPostJob,
} from "./durable-x-post-jobs";
import type { XScheduledPost } from "./types";

/**
 * P0-5: schedule-store is a thin façade over durable X post jobs.
 * Production never uses module-level Map / array as SoT.
 */

export async function listXScheduledPosts(
  userId?: string,
): Promise<XScheduledPost[]> {
  if (!userId?.trim()) return [];
  const jobs = await listDurableXPostJobs({ ownerId: userId });
  return jobs.map(jobToLegacyScheduled);
}

/** @deprecated Prefer claimDueXPostJobs — listing due without claim is racy. */
export async function listDueXScheduledPosts(
  now = new Date(),
): Promise<XScheduledPost[]> {
  // Intentionally empty for Production-safe path: callers must claim.
  // Kept for test compatibility that still expect a list — returns [] when
  // durable-required so accidental use cannot double-post.
  void now;
  return [];
}

export async function saveXScheduledPost(input: {
  userId: string;
  text: string;
  scheduledFor: string;
  automationId?: string | null;
}): Promise<XScheduledPost> {
  const { job } = await insertDurableXPostJob({
    ownerId: input.userId,
    content: input.text,
    scheduledAt: input.scheduledFor,
    automationId: input.automationId ?? null,
  });
  return jobToLegacyScheduled(job);
}

export async function updateXScheduledPost(
  id: string,
  patch: Partial<Pick<XScheduledPost, "status" | "errorMessage">>,
  options?: { ownerId: string; workerId?: string },
): Promise<XScheduledPost | null> {
  if (!options?.ownerId?.trim()) return null;
  const statusMap: Record<
    NonNullable<typeof patch.status>,
    Parameters<typeof transitionDurableXPostJob>[0]["toStatus"]
  > = {
    pending: "scheduled",
    posted: "posted",
    failed: "failed",
    cancelled: "canceled",
  };
  if (!patch.status) return null;
  const toStatus = statusMap[patch.status];
  if (toStatus === "posted") {
    // posted must go through completeClaimedXPostWithEvidence
    return null;
  }
  if (toStatus === "canceled") {
    const job = await cancelDurableXPostJob({
      xPostJobId: id,
      ownerId: options.ownerId,
    });
    return job ? jobToLegacyScheduled(job) : null;
  }
  const job = await transitionDurableXPostJob({
    xPostJobId: id,
    ownerId: options.ownerId,
    toStatus,
    expectedClaimedBy: options.workerId,
    patch: {
      lastErrorMessage: patch.errorMessage ?? null,
    },
  });
  return job ? jobToLegacyScheduled(job) : null;
}

export async function claimDueScheduledXPosts(input: {
  workerId: string;
  limit?: number;
  nowMs?: number;
}): Promise<DurableXPostJob[]> {
  return claimDueXPostJobs(input);
}

export function resetXScheduledPostsStore(): void {
  resetDurableXPostJobsForTests();
}
