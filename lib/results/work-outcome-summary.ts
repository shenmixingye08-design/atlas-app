import type { Project } from "@/lib/projects/types";
import {
  getDocumentBody,
  getSocialPostCards,
} from "@/lib/orchestration/deliverable-display";
import { getDeliverablePreviewText } from "@/lib/orchestration/deliverable-types";

import { deriveCompletionTitle, deriveTargetType } from "./completion";

export type WorkOutcomeSummary = {
  workDone: string;
  deliverableTitle: string;
  deliverablePreview: string;
  deliverableLinks: Array<{ label: string; href: string }>;
  deliverables: Array<{ title: string; preview: string }>;
  aiActions: string[];
  usedAi: string[];
  durationLabel: string;
  nextRecommendations: string[];
};

function formatDuration(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return "—";
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}秒`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return seconds > 0 ? `${minutes}分 ${seconds}秒` : `${minutes}分`;
  }
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return remMinutes > 0 ? `${hours}時間 ${remMinutes}分` : `${hours}時間`;
}

function collectUsedAi(project: Project): string[] {
  const names = new Set<string>();
  const result = project.result;
  if (!result) {
    return ["MINERVOT AI秘書"];
  }

  for (const phase of [result.ceo, result.plannerPlan, result.plannerTasks]) {
    if (phase?.result?.name) names.add(phase.result.name);
    if (phase?.result?.model && phase.result.model !== "atlas-mock") {
      names.add(phase.result.model);
    }
  }

  for (const execution of result.executions ?? []) {
    const workerName = execution.worker?.result?.name;
    const reviewerName = execution.reviewer?.result?.name;
    if (workerName) names.add(workerName);
    if (reviewerName) names.add(reviewerName);
  }

  if (names.size === 0) {
    names.add("MINERVOT AI秘書");
  }
  return Array.from(names).slice(0, 6);
}

function deliverablePreviewText(project: Project): string {
  const deliverable = project.result?.deliverable ?? null;
  if (deliverable) {
    const cards = getSocialPostCards(deliverable).filter((card) => card.trim());
    if (cards[0]) return cards[0].trim().slice(0, 280);
    const body = getDocumentBody(deliverable).trim();
    if (body) return body.slice(0, 280);
    const preview = getDeliverablePreviewText(deliverable).trim();
    if (preview) return preview.slice(0, 280);
  }
  return (project.result?.finalResponse ?? "").trim().slice(0, 280);
}

function nextRecommendations(project: Project): string[] {
  const target = deriveTargetType(project);
  if (target === "x_post") {
    return [
      "投稿文を確認してそのまま投稿する",
      "別トーンの案を作り直す",
      "同じテーマで定期投稿を自動化する",
    ];
  }
  if (target === "email") {
    return [
      "文面を確認して送信する",
      "件名だけ別案を作る",
      "フォローアップを自動化する",
    ];
  }
  return [
    "成果物をダウンロードして共有する",
    "内容を修正して作り直す",
    "同じ仕事をテンプレートとして覚える",
  ];
}

function collectAiActions(project: Project): string[] {
  const actions: string[] = [];
  const request = project.workRequest?.trim() || project.title || "";
  if (request) actions.push(`依頼「${request.slice(0, 80)}」を受け付けて分析`);

  const result = project.result;
  if (result?.ceo) actions.push("方針を整理");
  if (result?.plannerPlan || result?.plannerTasks) actions.push("実行計画を作成");
  if ((result?.executions?.length ?? 0) > 0) actions.push("内容を作成・実行");
  if (result?.deliverable) actions.push("成果物を生成");
  if (result?.approved) actions.push("最終確認のうえ納品");

  if (actions.length <= 1) {
    actions.push("内容を作成", "成果物を整えて納品");
  }
  return [...new Set(actions)].slice(0, 8);
}

function collectDeliverables(project: Project): Array<{ title: string; preview: string }> {
  const items: Array<{ title: string; preview: string }> = [];
  const deliverable = project.result?.deliverable ?? null;
  if (deliverable) {
    const title =
      deliverable.title?.trim() ||
      deliverable.type ||
      deriveCompletionTitle(project);
    const preview = deliverablePreviewText(project);
    items.push({ title, preview });

    const cards = getSocialPostCards(deliverable).filter((card) => card.trim());
    cards.slice(1, 4).forEach((card, index) => {
      items.push({
        title: `別案 ${index + 2}`,
        preview: card.trim().slice(0, 200),
      });
    });
  } else if (project.result?.finalResponse?.trim()) {
    items.push({
      title: deriveCompletionTitle(project),
      preview: project.result.finalResponse.trim().slice(0, 280),
    });
  }
  return items;
}

/**
 * Build a results-first summary for the completion screen.
 * Pure helper — safe for unit tests and client components.
 */
export function buildWorkOutcomeSummary(project: Project): WorkOutcomeSummary {
  const title = deriveCompletionTitle(project);
  const deliverable = project.result?.deliverable ?? null;
  const deliverableTitle =
    deliverable?.title?.trim() ||
    deliverable?.type ||
    title;

  const links: Array<{ label: string; href: string }> = [
    { label: "この結果を開く", href: `/projects/${encodeURIComponent(project.id)}` },
    { label: "履歴で確認する", href: "/history" },
  ];

  return {
    workDone: project.workRequest?.trim() || project.title || "依頼された仕事",
    deliverableTitle,
    deliverablePreview: deliverablePreviewText(project),
    deliverableLinks: links,
    deliverables: collectDeliverables(project),
    aiActions: collectAiActions(project),
    usedAi: collectUsedAi(project),
    durationLabel: formatDuration(project.result?.totalDurationMs),
    nextRecommendations: nextRecommendations(project),
  };
}
