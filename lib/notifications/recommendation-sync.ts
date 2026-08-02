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

  // 広告・販促通知は禁止。仕事完了につながる自動化提案のみ（1件）。
  const isWorkSuggestion =
    /自動化|任せ|繰り返|次回|Memory|記憶|成果物/.test(top.message) ||
    Boolean(top.action.automationId);
  if (!isWorkSuggestion) return;

  notifyRecommendation(userId, {
    title: "次はこれを自動化できます",
    message: top.message,
    actionUrl: top.action.automationId ? "/automations" : "/workspace",
  });
}
