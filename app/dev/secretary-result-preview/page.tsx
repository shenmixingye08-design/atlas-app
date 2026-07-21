"use client";

import { notFound, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { SecretaryResultView } from "@/components/results/secretary-result-view";
import { LoadingState } from "@/components/ui/loading-state";
import { emptyDeliverable } from "@/lib/orchestration/deliverable-types";
import type { OrchestrationResult } from "@/lib/orchestration/types";
import { hydrateWorkflowState } from "@/lib/orchestration/workflow-state";
import type { Project } from "@/lib/projects/types";

/**
 * DEV-ONLY visual proof of the redesigned secretary result screen for each job
 * kind (X post / report / email). Renders SecretaryResultView without auth so
 * PC + mobile layouts can be screenshot-verified. Returns 404 in production.
 * Query `?kind=` : x (default) | report | email
 */

const now = new Date().toISOString();

function baseResult(
  assignment: string,
  deliverable: OrchestrationResult["deliverable"],
  finalResponse: string,
): OrchestrationResult {
  return {
    assignment,
    status: "completed",
    ceo: null,
    plannerPlan: null,
    plannerTasks: null,
    tasks: [],
    executions: [],
    deliverable,
    reviewComments: "",
    approved: true,
    finalResponse,
    totalDurationMs: 4200,
    workflow: hydrateWorkflowState({ status: "completed", approved: true }),
  };
}

function xProject(): Project {
  const deliverable = emptyDeliverable("document");
  deliverable.type = "social_post";
  deliverable.title = "新商品ローンチ告知";
  const tweet =
    "【新発売】あなたの時間を生み出すAI秘書「MINERVOT」本日リリース。\n" +
    "資料整理・投稿・要約・分析まで、まとめてお任せください。\n" +
    "まずは無料でお試しいただけます。#AI秘書 #業務効率化";
  deliverable.content = tweet;
  deliverable.markdown = tweet;
  deliverable.plainText = tweet;
  deliverable.metadata.snsPost = tweet;
  deliverable.metadata.posts = [tweet];

  const workRequest = "新商品のX投稿文を作って、投稿よろしく";
  return {
    id: "preview-x",
    title: workRequest,
    workRequest,
    status: "completed",
    progress: 100,
    createdAt: now,
    updatedAt: now,
    assignedEmployees: [],
    result: baseResult(workRequest, deliverable, "投稿文をご用意しました。"),
  };
}

function reportProject(): Project {
  const deliverable = emptyDeliverable("report");
  deliverable.title = "月次売上レポート";
  deliverable.summary = "先月の売上を要約し、改善提案を添えました。";
  deliverable.content =
    "## 概要\n先月の売上は前月比 +12% でした。\n\n## 主要指標\n- 新規顧客: 34件\n- 継続率: 92%\n\n## 改善提案\n1. 平日夜の配信を強化\n2. 高LTV層へのフォロー自動化";
  deliverable.markdown = deliverable.content;
  deliverable.plainText = deliverable.content.replace(/[#*-]/g, "").trim();

  const workRequest = "先月の売上データからレポートを作成して";
  return {
    id: "preview-report",
    title: workRequest,
    workRequest,
    status: "completed",
    progress: 100,
    createdAt: now,
    updatedAt: now,
    assignedEmployees: [],
    result: baseResult(workRequest, deliverable, "月次売上レポートを作成しました。"),
  };
}

function emailProject(): Project {
  const deliverable = emptyDeliverable("email");
  deliverable.title = "見積のご案内";
  deliverable.metadata.subject = "お見積りのご送付";
  deliverable.content =
    "山田様\n\nお世話になっております。\nご依頼いただいたお見積りをお送りいたします。\nご不明点がございましたらお申し付けください。\n\nどうぞよろしくお願いいたします。";
  deliverable.markdown = deliverable.content;
  deliverable.plainText = deliverable.content;

  const workRequest = "取引先への見積メールを作って";
  return {
    id: "preview-email",
    title: workRequest,
    workRequest,
    status: "completed",
    progress: 100,
    createdAt: now,
    updatedAt: now,
    assignedEmployees: [],
    result: baseResult(workRequest, deliverable, "メール文をご用意しました。"),
  };
}

function PreviewInner() {
  const kind = useSearchParams().get("kind") ?? "x";
  const project =
    kind === "report"
      ? reportProject()
      : kind === "email"
        ? emailProject()
        : xProject();

  return (
    <div data-testid="secretary-result-preview" data-kind={kind}>
      <SecretaryResultView project={project} backHref="/history" backLabel="履歴へ" />
    </div>
  );
}

export default function DevSecretaryResultPreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <AtlasAppShell active="projects" width="default">
      <Suspense fallback={<LoadingState />}>
        <PreviewInner />
      </Suspense>
    </AtlasAppShell>
  );
}
