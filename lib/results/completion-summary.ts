import type { Project } from "@/lib/projects/types";
import { ui } from "@/lib/i18n";

import { deriveCompletionTitle, deriveTargetType } from "./completion";

export type CompletionSummary = {
  workDone: string;
  deliverableTitle: string;
  deliverableHref: string | null;
  usedAi: string;
  durationLabel: string;
  nextRecommend: string;
  failureReason: string | null;
};

function formatDuration(totalMs: number | null | undefined): string {
  if (totalMs == null || !Number.isFinite(totalMs) || totalMs <= 0) {
    return ui.secretaryResult.durationUnknown;
  }
  const totalSeconds = Math.max(1, Math.round(totalMs / 1000));
  if (totalSeconds < 60) {
    return ui.secretaryResult.durationSeconds(totalSeconds);
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return ui.secretaryResult.durationMinutes(minutes, seconds);
}

function resolveUsedAi(project: Project): string {
  const assigned = project.assignedEmployees ?? [];
  if (assigned.length > 0) {
    return `${ui.secretaryResult.usedAiDefault}（${assigned.length}名の専門AI）`;
  }
  const executions = project.result?.executions ?? [];
  if (executions.length > 0) {
    return `${ui.secretaryResult.usedAiDefault}（${executions.length}ステップ）`;
  }
  return ui.secretaryResult.usedAiDefault;
}

function resolveNextRecommend(project: Project): string {
  const target = deriveTargetType(project);
  switch (target) {
    case "x_post":
      return "次回も投稿文作成から任せる";
    case "email":
      return "次回も営業メール作成をテンプレートから始める";
    default:
      return "よく使うテンプレートから次の依頼を始める";
  }
}

/** Build the results-first completion summary for the secretary result screen. */
export function buildCompletionSummary(project: Project): CompletionSummary {
  const title = deriveCompletionTitle(project);
  const deliverableTitle =
    project.result?.deliverable?.title?.trim() ||
    project.title?.trim() ||
    title;
  const failureReason =
    project.status !== "completed"
      ? project.error?.trim() ||
        project.result?.error?.trim() ||
        null
      : project.result?.error?.trim() || null;

  return {
    workDone: project.workRequest?.trim() || title,
    deliverableTitle,
    deliverableHref: `/projects/${encodeURIComponent(project.id)}`,
    usedAi: resolveUsedAi(project),
    durationLabel: formatDuration(project.result?.totalDurationMs),
    nextRecommend: resolveNextRecommend(project),
    failureReason,
  };
}
