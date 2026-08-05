import "server-only";

import { automationService } from "@/lib/automations/automation-service";
import { generateProactiveSuggestions } from "@/lib/proactive-suggestions/generators";
import { DEFAULT_USER_WORK_PROFILE } from "@/lib/user-profile/types";

import { notifyRecommendation } from "./emitters";
import { listUserNotifications } from "./service";

const SYNC_COOLDOWN_MS = 60 * 60 * 1000; // 1h per user per process

function getSyncBucket(): Map<string, number> {
  const scope = globalThis as typeof globalThis & {
    __atlasRecommendationSyncAt?: Map<string, number>;
  };
  if (!scope.__atlasRecommendationSyncAt) {
    scope.__atlasRecommendationSyncAt = new Map();
  }
  return scope.__atlasRecommendationSyncAt;
}

/** Creates at most one recommendation notification per user per day. */
export async function syncRecommendationNotifications(
  userId: string,
): Promise<void> {
  const now = Date.now();
  const bucket = getSyncBucket();
  const last = bucket.get(userId) ?? 0;
  // P09: skip expensive automation.list when recently synced in this instance.
  if (now - last < SYNC_COOLDOWN_MS) return;

  const today = new Date().toISOString().slice(0, 10);
  const existing = await listUserNotifications(userId);
  const alreadySent = existing.some(
    (record) =>
      record.type === "recommendation" && record.createdAt.startsWith(today),
  );
  if (alreadySent) {
    bucket.set(userId, now);
    return;
  }

  const automations = await automationService.list();
  const suggestions = generateProactiveSuggestions({
    automations,
    profile: DEFAULT_USER_WORK_PROFILE,
  });

  const top = suggestions[0];
  bucket.set(userId, now);
  if (!top) return;

  await notifyRecommendation(userId, {
    title: "MINERVOTからのおすすめ",
    message: top.message,
    actionUrl: top.action.automationId ? "/automations" : "/workspace",
  });
}
