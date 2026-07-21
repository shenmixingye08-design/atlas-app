"use client";

import { notFound } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import { ProjectDetailView } from "@/components/projects/project-detail-view";
import { LoadingState } from "@/components/ui/loading-state";
import { emptyDeliverable } from "@/lib/orchestration/deliverable-types";
import type { OrchestrationResult } from "@/lib/orchestration/types";
import { hydrateWorkflowState } from "@/lib/orchestration/workflow-state";
import { localStorageProjectRepository } from "@/lib/projects/repository-provider";
import type { Project } from "@/lib/projects/types";

/**
 * DEV-ONLY proof that clicking「結果を見る」lands on the REAL project detail
 * component (`ProjectDetailView` → `DeliverableResultView`) and shows THAT
 * deliverable's content. Returns 404 in production.
 *
 * `/projects/[id]` is Clerk-protected, so a logged-out E2E is redirected to
 * sign-in (expected in production, where the user is authenticated). This
 * public /dev route renders the exact same component tree that page renders
 * (`app/projects/[id]/page.tsx` = AtlasAppShell + ProjectDetailView), reading
 * the durable-shaped project from the client cache — proving 通知 → 結果を見る →
 * 成果物表示 without a login.
 *
 * Query `?id=` selects the seeded project id (default `commander-contract`).
 */

const DEEPLINK_PROJECT_ID = "commander-contract";

function contractProject(): Project {
  const nowIso = new Date().toISOString();
  const deliverable = emptyDeliverable("report");
  deliverable.title = "契約書の要約";
  deliverable.summary = "業務委託契約書の要点を要約しました。";
  deliverable.content =
    "## 契約書の要約\n\n### 契約の目的\n業務委託に関する条件を定めるもの。\n\n### 主要条項\n- 委託料: 月額30万円（税別）\n- 契約期間: 2026年8月1日〜2027年7月31日\n- 中途解約: 30日前の書面通知\n\n### 注意点\n- 秘密保持義務は契約終了後も2年間存続します。";
  deliverable.markdown = deliverable.content;
  deliverable.plainText = deliverable.content.replace(/[#*-]/g, "").trim();
  deliverable.html = "<h2>契約書の要約</h2><p>業務委託契約書の要点を要約しました。</p>";

  const result: OrchestrationResult = {
    assignment: "この契約書を要約して",
    status: "completed",
    ceo: null,
    plannerPlan: null,
    plannerTasks: null,
    tasks: [],
    executions: [],
    deliverable,
    reviewComments: "",
    approved: true,
    finalResponse:
      "契約書の要約が完了しました。委託料・契約期間・中途解約・秘密保持の要点をまとめています。",
    totalDurationMs: 5200,
    workflow: hydrateWorkflowState({ status: "completed", approved: true }),
  };

  return {
    id: DEEPLINK_PROJECT_ID,
    title: "契約書の要約",
    workRequest: "この契約書を要約して",
    status: "completed",
    progress: 100,
    createdAt: nowIso,
    updatedAt: nowIso,
    assignedEmployees: [],
    result,
  };
}

function seedProject(): void {
  try {
    const existing = localStorageProjectRepository
      .list()
      .filter((project) => project.id !== DEEPLINK_PROJECT_ID);
    localStorageProjectRepository.save([contractProject(), ...existing]);
  } catch {
    // best-effort; dev-only
  }
}

function DetailPreviewInner() {
  const id = useSearchParams().get("id") ?? DEEPLINK_PROJECT_ID;
  // Seed synchronously (before child effects) so the client cache resolves the
  // durable-shaped project on first render.
  useState(() => {
    seedProject();
    return true;
  });

  return (
    <AtlasAppShell active="projects" width="default">
      <ProjectDetailView projectId={id} />
    </AtlasAppShell>
  );
}

export default function DevProjectDetailPreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <Suspense fallback={<LoadingState />}>
      <DetailPreviewInner />
    </Suspense>
  );
}
