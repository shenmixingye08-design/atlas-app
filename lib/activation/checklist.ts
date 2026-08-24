import { buildQuickStartHref, getActivationGoal } from "./goals";
import type {
  ActivationChecklistItem,
  ActivationGoalId,
  ActivationProgress,
} from "./types";

export function buildActivationChecklist(
  progress: ActivationProgress,
): ActivationChecklistItem[] {
  if (progress.checklistHidden || progress.phase === "completed") return [];
  if (progress.legacyUser) return [];

  const goalId = progress.selectedGoal ?? progress.recommendedGoal;
  const goal = getActivationGoal(goalId);
  const assignment = goal.assignmentTemplate(progress.draftInputs);
  const requestHref = buildQuickStartHref(goal, assignment);
  const milestones = progress.milestones;

  const items: ActivationChecklistItem[] = [
    {
      id: "pick_goal",
      label: "目的を選ぶ",
      done: Boolean(progress.selectedGoal || milestones.goal_selected),
      current: false,
      href: "/projects?onboarding=1",
      cta: "目的を選ぶ",
    },
    {
      id: "first_request",
      label: goal.id === "recurring" || goal.id === "x_autopost"
        ? "最初の自動化を作る"
        : "最初の依頼を作る",
      done: Boolean(
        milestones.first_request_submitted ||
          milestones.first_automation_created ||
          milestones.first_x_draft_created,
      ),
      current: false,
      href: requestHref,
      cta: "作る",
    },
    {
      id: "view_result",
      label: "結果を確認する",
      done: Boolean(
        milestones.first_result_viewed ||
          milestones.first_artifact_downloaded ||
          milestones.firstSuccessAt,
      ),
      current: false,
      href: "/projects",
      cta: "結果を見る",
    },
  ];

  if (goal.needsX || goal.needsGoogle) {
    items.push({
      id: "connect_integration",
      label: goal.needsX ? "Xを接続する" : "カレンダーを接続する",
      done: Boolean(milestones.integration_connected),
      current: false,
      href: goal.needsX ? "/workspace/x?onboarding=1" : "/settings/google/calendar",
      cta: "接続する",
    });
  }

  if (goal.id === "recurring" || goal.id === "x_autopost") {
    items.push({
      id: "create_automation",
      label: "自動化を1件設定する",
      done: Boolean(
        milestones.first_automation_created ||
          milestones.first_automation_run_completed,
      ),
      current: false,
      href: goal.id === "x_autopost" ? "/workspace/x" : "/automations?create=1",
      cta: "設定する",
    });
  }

  const firstOpen = items.find((item) => !item.done);
  if (firstOpen) firstOpen.current = true;
  return items;
}

export function nextActivationHref(progress: ActivationProgress): string {
  const items = buildActivationChecklist(progress);
  return items.find((item) => item.current)?.href ?? "/workspace";
}

export function describeResume(progress: ActivationProgress): string {
  if (progress.phase === "skipped") {
    return "前回は後で進めるを選びました。目的から再開できます。";
  }
  const current = buildActivationChecklist(progress).find((item) => item.current);
  if (!current) return "前回の続きから仕事を確認できます。";
  return `前回は「${current.label}」の前まで進んでいます。`;
}

export function goalIdOrRecommended(
  value: ActivationGoalId | null,
  fallback: ActivationGoalId,
): ActivationGoalId {
  return value ?? fallback;
}
