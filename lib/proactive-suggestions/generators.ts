import {
  getTodaysAutomations,
  isAutomationScheduledForToday,
  wasAutomationCompletedToday,
} from "@/lib/automations/today";
import type { Automation } from "@/lib/automations/types";
import { inferJobCategory } from "@/lib/user-profile/categories";
import type { UserWorkProfile } from "@/lib/user-profile/types";
import { getOnboardingTask } from "@/lib/onboarding/tasks";
import {
  applyOnboardingPriorityBoost,
  getPreferredOnboardingTasks,
} from "@/lib/onboarding/recommendations";

import { buildSuggestionTimeContext, minutesUntilScheduledTime } from "./context";
import {
  buildProfileHabitMessage,
  buildScheduledHabitMessage,
  buildSnsActivityDropMessage,
} from "./messages";
import type {
  GenerateSuggestionsInput,
  ProactiveSuggestion,
  SuggestionIntegrationHint,
} from "./types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function integrationForAutomation(automation: Automation): SuggestionIntegrationHint {
  const text = `${automation.name} ${automation.workflow.assignment}`;
  if (/メール|mail/i.test(text)) return "gmail";
  if (/sns|x\(|twitter|投稿/i.test(text)) return "sns";
  if (/drive|dropbox|ファイル/i.test(text)) return "dropbox";
  if (/ブログ|wordpress/i.test(text)) return "wordpress";
  return "atlas";
}

function schedulePriority(
  automation: Automation,
  context: ReturnType<typeof buildSuggestionTimeContext>,
): number {
  if (automation.schedule.kind !== "schedule") return 50;

  const delta = minutesUntilScheduledTime(
    context,
    automation.schedule.preset.hour,
    automation.schedule.preset.minute,
  );

  if (delta >= 0 && delta <= 120) return 100 - delta;
  if (delta >= -60 && delta < 0) return 80;
  return 60;
}

function buildScheduledSuggestion(
  automation: Automation,
  context: ReturnType<typeof buildSuggestionTimeContext>,
  profile: UserWorkProfile,
  now: Date,
): ProactiveSuggestion {
  return {
    id: `scheduled:${automation.id}`,
    kind: "scheduled_habit",
    message: buildScheduledHabitMessage(automation, context, profile),
    automationId: automation.id,
    automationName: automation.name,
    action: {
      automationId: automation.id,
      workspaceAssignment: automation.workflow.assignment,
    },
    integrationHint: integrationForAutomation(automation),
    priority: schedulePriority(automation, context),
    generatedAt: now.toISOString(),
  };
}

function isSnsAutomation(automation: Automation): boolean {
  const text = `${automation.id} ${automation.name} ${automation.workflow.assignment}`;
  return /sns|x\(|twitter|投稿/i.test(text);
}

function daysSinceLastRun(automation: Automation, now: Date): number | null {
  if (!automation.lastRun) return null;
  return (now.getTime() - new Date(automation.lastRun).getTime()) / MS_PER_DAY;
}

function buildSnsDropSuggestion(
  automation: Automation,
  now: Date,
): ProactiveSuggestion | null {
  if (!automation.enabled || wasAutomationCompletedToday(automation, now)) {
    return null;
  }

  const daysSince = daysSinceLastRun(automation, now);
  if (daysSince !== null && daysSince < 2) return null;

  const scheduledToday = isAutomationScheduledForToday(automation, now);
  if (scheduledToday && daysSince !== null && daysSince < 3) return null;

  return {
    id: `pattern:sns-decreased:${automation.id}`,
    kind: "activity_pattern",
    message: buildSnsActivityDropMessage(),
    automationId: automation.id,
    automationName: automation.name,
    action: {
      automationId: automation.id,
      workspaceAssignment: automation.workflow.assignment,
    },
    integrationHint: "sns",
    priority: 70,
    generatedAt: now.toISOString(),
  };
}

function buildProfileSuggestions(
  automations: readonly Automation[],
  profile: UserWorkProfile,
  now: Date,
  existingIds: Set<string>,
): ProactiveSuggestion[] {
  const results: ProactiveSuggestion[] = [];

  for (const job of profile.frequentlyUsedJobs.slice(0, 3)) {
    const category = job.jobCategory;
    const linked = automations.find(
      (automation) =>
        inferJobCategory(
          `${automation.name} ${automation.workflow.assignment}`,
        ) === category,
    );

    if (linked) continue;

    const message = buildProfileHabitMessage(job.label, profile);
    if (!message) continue;

    const id = `profile:${category}`;
    if (existingIds.has(id)) continue;

    results.push({
      id,
      kind: "profile_habit",
      message,
      action: {
        workspaceAssignment: `${job.label}の仕事を進めてください。`,
      },
      integrationHint: "atlas",
      priority: 40 + job.count,
      generatedAt: now.toISOString(),
    });
    existingIds.add(id);
  }

  return results;
}

function buildOnboardingPreferenceSuggestions(
  profile: UserWorkProfile,
  now: Date,
  existingIds: Set<string>,
): ProactiveSuggestion[] {
  const tasks = getPreferredOnboardingTasks(profile);
  const results: ProactiveSuggestion[] = [];

  for (const taskId of tasks.slice(0, 3)) {
    const task = getOnboardingTask(taskId);
    if (!task.seedText || taskId === "undecided") continue;

    const id = `onboarding:${taskId}`;
    if (existingIds.has(id)) continue;

    const integrationHint =
      task.recommendedServices[0] === "x"
        ? "sns"
        : task.recommendedServices[0] === "google"
          ? "gmail"
          : task.recommendedServices[0] === "wordpress"
            ? "wordpress"
            : "atlas";

    results.push({
      id,
      kind: "profile_habit",
      message: `${task.label}を優先して進めましょう。MINERVOTが最後まで担当します。`,
      action: {
        workspaceAssignment: `${task.seedText}の仕事を進めてください。`,
      },
      integrationHint,
      priority: 55,
      generatedAt: now.toISOString(),
    });
    existingIds.add(id);
  }

  return results;
}

export function generateProactiveSuggestions({
  automations,
  profile,
  now = new Date(),
}: GenerateSuggestionsInput): ProactiveSuggestion[] {
  const context = buildSuggestionTimeContext(now);
  const suggestions: ProactiveSuggestion[] = [];
  const seenAutomationIds = new Set<string>();

  for (const { automation, completed } of getTodaysAutomations(automations, now)) {
    if (!automation.enabled || completed) continue;
    suggestions.push(buildScheduledSuggestion(automation, context, profile, now));
    seenAutomationIds.add(automation.id);
  }

  const snsAutomations = automations.filter(isSnsAutomation);
  for (const automation of snsAutomations) {
    if (seenAutomationIds.has(automation.id)) continue;
    const drop = buildSnsDropSuggestion(automation, now);
    if (drop) suggestions.push(drop);
  }

  const existingIds = new Set(suggestions.map((item) => item.id));
  suggestions.push(
    ...buildProfileSuggestions(automations, profile, now, existingIds),
  );
  suggestions.push(
    ...buildOnboardingPreferenceSuggestions(profile, now, existingIds),
  );

  return applyOnboardingPriorityBoost(
    suggestions.sort((a, b) => b.priority - a.priority).slice(0, 5),
    profile,
  );
}
