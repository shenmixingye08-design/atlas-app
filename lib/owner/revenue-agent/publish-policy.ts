import type { RevenueContent } from "./types";

export function canPublishNow(item: RevenueContent, now = new Date()): boolean {
  if (item.xTweetId || item.status === "published") return false;
  if (item.attemptCount >= item.maxAttempts) return false;
  if (item.status === "approved") return true;
  if (item.status === "scheduled") {
    if (!item.scheduledAt) return false;
    return Date.parse(item.scheduledAt) <= now.getTime();
  }
  return false;
}
