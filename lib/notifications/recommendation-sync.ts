import "server-only";

import { automationService } from "@/lib/automations/automation-service";
import { generateProactiveSuggestions } from "@/lib/proactive-suggestions/generators";
import { DEFAULT_USER_WORK_PROFILE } from "@/lib/user-profile/types";

import { notifyRecommendation } from "./emitters";
import { listUserNotifications } from "./service";

/** Creates at most one recommendation notification per user per day. */
export async function syncRecommendationNotifications(
  userId: string,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const alreadySent = listUserNotifications(userId).some(
    (record) =>
      record.type === "recommendation" && record.createdAt.startsWith(today),
  );
  if (alreadySent) return;

  const automations = await automationService.list();
  const suggestions = generateProactiveSuggestions({
    automations,
    profile: DEFAULT_USER_WORK_PROFILE,
  });

  const top = suggestions[0];
  if (!top) return;

  notifyRecommendation(userId, {
    title: "ATLASからのおすすめ",
    message: top.message,
    actionUrl: top.action.automationId ? "/automations" : "/workspace",
  });
}
