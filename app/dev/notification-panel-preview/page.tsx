"use client";

import { notFound } from "next/navigation";
import { useEffect, useState } from "react";

import { NotificationList } from "@/components/notifications/notification-list";
import { NotificationPanelShell } from "@/components/notifications/notification-panel-shell";
import { formatNoticeTitle } from "@/lib/notifications/display";
import type { NotificationRecord } from "@/lib/notifications/types";
import { localStorageProjectRepository } from "@/lib/projects/repository-provider";
import type { Project } from "@/lib/projects/types";
import { emptyDeliverable } from "@/lib/orchestration/deliverable-types";
import type { OrchestrationResult } from "@/lib/orchestration/types";
import { hydrateWorkflowState } from "@/lib/orchestration/workflow-state";

/**
 * Durable-shaped project matching the「契約書」fixture notification's deep link
 * (`/projects/commander-contract`). Seeded into the client cache so clicking
 *「結果を見る」lands on the REAL `/projects/[id]` route → ProjectDetailView →
 * DeliverableResultView with the actual 成果物 content — proving the full path
 * 通知 → 結果を見る → 成果物表示 without a Clerk login.
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

/** Seed the durable-shaped project into the client cache (idempotent). */
function seedDeepLinkProject(): void {
  try {
    const existing = localStorageProjectRepository
      .list()
      .filter((project) => project.id !== DEEPLINK_PROJECT_ID);
    localStorageProjectRepository.save([contractProject(), ...existing]);
  } catch {
    // best-effort; dev-only
  }
}

/**
 * DEV-ONLY proof of the notification panel layout with the REAL panel + list
 * components and fixture notifications. Returns 404 in production.
 *
 * Purpose: when Clerk blocks production E2E we still need to prove the mobile
 * panel fits the viewport (Safe Area, no overflow, scrollable, close reachable)
 * and that titles are task-type-specific (「X自動投稿が完了しました」等) — this page
 * renders the same components used in the app header.
 *
 * Query `?variant=popover` renders the fixed/anchored popover exactly as the
 * bell does; the default renders it inline so it is always visible.
 */

const now = Date.now();

function iso(minutesAgo: number): string {
  return new Date(now - minutesAgo * 60_000).toISOString();
}

/**
 * Raw stored records (as emitters would persist them). The display layer derives
 * the task-type-specific title shown to the user.
 */
const FIXTURES: NotificationRecord[] = [
  {
    notificationId: "fx_x",
    userId: "dev",
    audience: "user",
    type: "completed",
    title: "X自動投稿が完了しました",
    message: "お待たせいたしました。投稿が完了しました。",
    relatedTaskId: "hist_1",
    relatedService: "x",
    isRead: false,
    createdAt: iso(2),
    actionUrl: "/workspace/x?historyId=hist_1",
  },
  {
    notificationId: "fx_contract",
    userId: "dev",
    audience: "user",
    type: "completed",
    title: "お仕事が完了しました",
    message: "お待たせいたしました。「契約書」の要約が完了しました。",
    relatedTaskId: "commander-contract",
    relatedService: "atlas",
    isRead: false,
    createdAt: iso(8),
    actionUrl: "/projects/commander-contract",
  },
  {
    notificationId: "fx_kakeibo",
    userId: "dev",
    audience: "user",
    type: "completed",
    title: "お仕事が完了しました",
    message: "レシートを読み取り、家計簿へ登録しました。",
    relatedTaskId: "commander-kakeibo",
    relatedService: "atlas",
    isRead: true,
    createdAt: iso(30),
    actionUrl: "/projects/commander-kakeibo",
  },
  {
    notificationId: "fx_blog",
    userId: "dev",
    audience: "user",
    type: "completed",
    title: "お仕事が完了しました",
    message: "ご依頼のブログ記事を作成しました。ご確認をお願いいたします。",
    relatedTaskId: "commander-blog",
    relatedService: "atlas",
    isRead: true,
    createdAt: iso(55),
    actionUrl: "/projects/commander-blog",
  },
  {
    notificationId: "fx_image",
    userId: "dev",
    audience: "user",
    type: "completed",
    title: "お仕事が完了しました",
    message: "アップロードされた画像の解析が完了しました。",
    relatedTaskId: "commander-image",
    relatedService: "atlas",
    isRead: true,
    createdAt: iso(70),
    actionUrl: "/projects/commander-image",
  },
  {
    notificationId: "fx_review",
    userId: "dev",
    audience: "user",
    type: "awaiting_review",
    title: "ご確認が必要な仕事がございます",
    message: "「見積書」について、ご確認をお願いいたします。",
    relatedTaskId: "auto_estimate",
    relatedService: "atlas",
    isRead: false,
    createdAt: iso(90),
    actionUrl: "/automations?id=auto_estimate",
  },
  {
    notificationId: "fx_failed",
    userId: "dev",
    audience: "user",
    type: "error",
    title: "処理を完了できませんでした",
    message: "処理を完了できませんでした。契約書の読み取りに失敗しました。",
    relatedTaskId: "commander-fail",
    relatedService: "atlas",
    isRead: false,
    createdAt: iso(120),
    actionUrl: "/projects/commander-fail",
  },
];

export default function DevNotificationPanelPreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <PreviewInner />;
}

function PreviewInner() {
  const [open, setOpen] = useState(true);

  // Seed the durable-shaped project so「結果を見る」on the 契約書 notice lands on
  // the real /projects/<id> route with content.
  useEffect(() => {
    seedDeepLinkProject();
  }, []);

  return (
    <div className="min-h-dvh bg-[var(--background)] px-4 py-6">
      <header className="mx-auto max-w-md">
        <h1 className="text-lg font-semibold text-foreground">
          通知パネル プレビュー（DEV）
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          実際の NotificationPanelShell + NotificationList を固定データで表示します。
        </p>
      </header>

      {/* Derived title examples (proves task-type-specific titles). */}
      <section
        data-testid="derived-title-examples"
        className="mx-auto mt-6 max-w-md space-y-2 rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-[var(--card)] p-4"
      >
        <p className="text-sm font-semibold text-foreground">
          タイトル生成の例
        </p>
        <ul className="space-y-1 text-sm text-[var(--text-secondary)]">
          {FIXTURES.map((item) => (
            <li key={item.notificationId} data-testid="derived-title">
              ・{formatNoticeTitle(item)}
            </li>
          ))}
        </ul>
      </section>

      {/* Inline panel — always visible for layout screenshots. */}
      <section className="mx-auto mt-6 max-w-md">
        <NotificationPanelShell inline onClose={() => {}}>
          <NotificationList compact items={FIXTURES} />
        </NotificationPanelShell>
      </section>

      {/* Real popover — fixed on mobile / anchored on desktop, like the bell. */}
      <div className="relative mx-auto mt-6 flex max-w-md justify-end">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="touch-target flex h-10 w-10 items-center justify-center rounded-full text-lg hover:bg-[var(--surface-muted)] focus-ring"
          aria-label="通知を開く"
          aria-expanded={open}
        >
          <span aria-hidden>🔔</span>
        </button>
        {open && (
          <NotificationPanelShell onClose={() => setOpen(false)}>
            <NotificationList compact items={FIXTURES} />
          </NotificationPanelShell>
        )}
      </div>
    </div>
  );
}
