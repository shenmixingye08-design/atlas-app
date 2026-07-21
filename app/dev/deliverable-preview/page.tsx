"use client";

import { notFound, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { DeliverableResultView } from "@/components/projects/deliverable-result-view";
import { DeliverableStateNotice } from "@/components/projects/deliverable-state-notice";
import { LoadingState } from "@/components/ui/loading-state";
import { emptyDeliverable } from "@/lib/orchestration/deliverable-types";
import type { OrchestrationResult } from "@/lib/orchestration/types";
import { hydrateWorkflowState } from "@/lib/orchestration/workflow-state";
import {
  notFoundDisplayState,
  resolveDeliverableDisplayState,
} from "@/lib/projects/deliverable-state";
import type { Project } from "@/lib/projects/types";

/**
 * DEV-ONLY proof that the deep-link result view (`/projects/<id>` →
 * ProjectDetailView → DeliverableResultView) renders a real 成果物, plus each
 * never-blank fallback state. Returns 404 in production. Query `?state=`:
 *   (default) ready | generating | failed | not_found
 */

const now = new Date().toISOString();

function readyProject(): Project {
  const deliverable = emptyDeliverable("report");
  deliverable.title = "月次売上レポート";
  deliverable.summary = "先月の売上を要約し、改善提案を添えました。";
  deliverable.content =
    "## 概要\n先月の売上は前月比 +12% でした。\n\n## 主要指標\n- 新規顧客: 34件\n- 継続率: 92%\n\n## 改善提案\n1. 平日夜の配信を強化\n2. 高LTV層へのフォロー自動化";
  deliverable.markdown = deliverable.content;
  deliverable.plainText = deliverable.content.replace(/[#*-]/g, "").trim();
  deliverable.html = `<h2>概要</h2><p>先月の売上は前月比 +12% でした。</p>`;

  const result: OrchestrationResult = {
    assignment: "先月の売上データを要約してレポートにして",
    status: "completed",
    ceo: null,
    plannerPlan: null,
    plannerTasks: null,
    tasks: [],
    executions: [],
    deliverable,
    reviewComments: "",
    approved: true,
    finalResponse: "月次売上レポートを作成しました。前月比 +12% の要約と改善提案を含みます。",
    totalDurationMs: 4200,
    workflow: hydrateWorkflowState({ status: "completed", approved: true }),
  };

  return {
    id: "commander-preview_ready",
    title: "月次売上レポート",
    workRequest: "先月の売上データを要約してレポートにして",
    status: "completed",
    progress: 100,
    createdAt: now,
    updatedAt: now,
    assignedEmployees: [],
    result,
  };
}

function failedProject(): Project {
  const result: OrchestrationResult = {
    assignment: "X へ自動投稿して",
    status: "failed",
    ceo: null,
    plannerPlan: null,
    plannerTasks: null,
    tasks: [],
    executions: [],
    deliverable: emptyDeliverable(),
    reviewComments: "",
    approved: false,
    finalResponse: "",
    totalDurationMs: 800,
    error: "X 連携の認証が期限切れです。設定から再連携してください。",
    workflow: hydrateWorkflowState({ status: "failed" }),
  };
  return {
    id: "commander-preview_failed",
    title: "X 自動投稿",
    workRequest: "X へ自動投稿して",
    status: "review",
    progress: 20,
    createdAt: now,
    updatedAt: now,
    assignedEmployees: [],
    result,
    error: "X 連携の認証が期限切れです。設定から再連携してください。",
  };
}

function generatingProject(): Project {
  return {
    id: "commander-preview_generating",
    title: "調査レポート",
    workRequest: "競合3社を調査してレポートにして",
    status: "running",
    progress: 40,
    createdAt: now,
    updatedAt: now,
    assignedEmployees: [],
    result: null,
  };
}

function PreviewInner() {
  const state = useSearchParams().get("state") ?? "ready";

  if (state === "not_found") {
    return <DeliverableStateNotice state={notFoundDisplayState()} />;
  }

  const project =
    state === "failed"
      ? failedProject()
      : state === "generating"
        ? generatingProject()
        : readyProject();

  const display = resolveDeliverableDisplayState(project);

  return (
    <div data-testid="deliverable-preview" data-state={display.kind}>
      {display.kind === "ready" ? (
        <DeliverableResultView project={project} />
      ) : (
        <DeliverableStateNotice state={display} />
      )}
    </div>
  );
}

export default function DevDeliverablePreviewPage() {
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
