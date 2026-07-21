"use client";

import { notFound } from "next/navigation";
import { useState } from "react";

import { NotificationList } from "@/components/notifications/notification-list";
import { emptyDeliverable } from "@/lib/orchestration/deliverable-types";
import type { OrchestrationResult } from "@/lib/orchestration/types";
import { hydrateWorkflowState } from "@/lib/orchestration/workflow-state";
import { localStorageProjectRepository } from "@/lib/projects/repository-provider";
import type { Project } from "@/lib/projects/types";
import { seedDevResultTarget } from "@/lib/results/dev-preview";
import type { NotificationRecord } from "@/lib/notifications/types";

/**
 * DEV-ONLY end-to-end proof that clicking「結果を見る」navigates to the REAL
 * `/results/<notificationId>` route and renders THAT 成果物 — without a Clerk
 * login. Returns 404 in production.
 *
 * Flow proven:
 *   NotificationList (real component)
 *     → href = /results/<notificationId> (resolveNoticeActionUrl)
 *     → real ResultsView on /results/<id>
 *     → dev fallback resolves the seeded target → ProjectDetailView
 *     → DeliverableResultView shows the deliverable body text
 *
 * Production login E2E is still recommended; auth blocks a logged-out
 * production run, which is expected.
 */

const TARGET_PROJECT_ID = "commander-contract";
const NOTIFICATION_ID = "ntf_devcontract";

function contractProject(): Project {
  const nowIso = new Date().toISOString();
  const deliverable = emptyDeliverable("report");
  deliverable.title = "契約書の要約";
  deliverable.summary = "業務委託契約書の要点を要約しました。";
  deliverable.content =
    "## 契約書の要約\n\n### 契約の目的\n業務委託に関する条件を定めるもの。\n\n### 主要条項\n- 委託料: 月額30万円（税別）\n- 契約期間: 2026年8月1日〜2027年7月31日\n- 中途解約: 30日前の書面通知\n\n### 注意点\n- 秘密保持義務は契約終了後も2年間存続します。";
  deliverable.markdown = deliverable.content;
  deliverable.plainText = deliverable.content.replace(/[#*-]/g, "").trim();
  deliverable.html =
    "<h2>契約書の要約</h2><p>業務委託契約書の要点を要約しました。</p>";

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
    id: TARGET_PROJECT_ID,
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

/** New-format notification: targetType + targetId + `/results/<id>` actionUrl. */
const FIXTURE: NotificationRecord = {
  notificationId: NOTIFICATION_ID,
  userId: "dev",
  audience: "user",
  type: "completed",
  title: "お仕事が完了しました",
  message: "お待たせいたしました。「契約書」の要約が完了しました。",
  relatedTaskId: TARGET_PROJECT_ID,
  relatedService: "atlas",
  isRead: false,
  createdAt: new Date().toISOString(),
  actionUrl: `/results/${NOTIFICATION_ID}`,
  targetType: "deliverable",
  targetId: TARGET_PROJECT_ID,
  deliverableId: TARGET_PROJECT_ID,
};

function seed(): void {
  try {
    const existing = localStorageProjectRepository
      .list()
      .filter((project) => project.id !== TARGET_PROJECT_ID);
    localStorageProjectRepository.save([contractProject(), ...existing]);
    seedDevResultTarget(NOTIFICATION_ID, {
      targetType: "deliverable",
      targetId: TARGET_PROJECT_ID,
    });
  } catch {
    // best-effort; dev-only
  }
}

export default function DevResultsFlowPreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  // Seed synchronously before the list renders so the click resolves content.
  useState(() => {
    seed();
    return true;
  });

  return (
    <div className="min-h-dvh bg-[var(--background)] px-4 py-6">
      <header className="mx-auto max-w-md">
        <h1 className="text-lg font-semibold text-foreground">
          結果フロー プレビュー（DEV）
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          「結果を見る」をクリックすると、実ルート /results/{NOTIFICATION_ID}{" "}
          に遷移し、成果物が表示されます。
        </p>
        <p className="mt-1 text-xs text-[var(--text-muted)]" data-testid="expected-href">
          期待リンク: /results/{NOTIFICATION_ID}
        </p>
      </header>

      <section className="mx-auto mt-6 max-w-md" data-testid="results-flow-list">
        <NotificationList compact items={[FIXTURE]} />
      </section>
    </div>
  );
}
