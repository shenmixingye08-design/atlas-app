"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { AutomationRun, AutomationV2 } from "@/lib/automation-platform/types";
import { fetchAutomationRuns } from "@/lib/automation-platform/client";
import {
  AUTOMATION_STATUS_LABEL,
  formatRunStatus,
} from "@/lib/automation-platform/operations/status-labels";
import { Button } from "@/components/ui/button";
import { retentionPolicySummary } from "@/lib/automation-platform/history/retention";

const POLICY_LABEL: Record<AutomationV2["executionPolicy"]["mode"], string> = {
  review_before_run: "毎回確認",
  run_then_notify: "自動実行",
  review_selected_steps: "手順ごとに確認",
  approve_first_then_auto: "初回のみ確認",
  review_high_risk_only: "高リスクのみ確認",
  review_post_only: "投稿だけ確認",
  review_send_only: "送信だけ確認",
};

export function AutomationV2DetailPanel({
  automation,
  onClose,
  onPause,
  onResume,
  onRun,
  onDuplicate,
  onArchive,
  busy,
}: {
  automation: AutomationV2;
  onClose: () => void;
  onPause: () => void;
  onResume: () => void;
  onRun: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  busy?: boolean;
}) {
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const retention = retentionPolicySummary();

  useEffect(() => {
    let cancelled = false;
    void fetchAutomationRuns(automation.id)
      .then((items) => {
        if (!cancelled) setRuns(items.slice(0, 8));
      })
      .catch(() => {
        if (!cancelled) setRuns([]);
      });
    return () => {
      cancelled = true;
    };
  }, [automation.id]);

  const terminal = runs.filter((run) =>
    ["succeeded", "failed", "partially_succeeded"].includes(run.status),
  );
  const successRate =
    terminal.length > 0
      ? Math.round(
          (terminal.filter((run) => run.status === "succeeded").length /
            terminal.length) *
            100,
        )
      : null;
  const avgDurationMs =
    terminal.length > 0
      ? Math.round(
          terminal.reduce((sum, run) => sum + (run.durationMs ?? 0), 0) /
            terminal.length,
        )
      : null;
  const recentFailures = runs.filter(
    (run) =>
      run.status === "failed" || run.status === "partially_succeeded",
  );

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`${automation.name}の詳細`}
    >
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-[var(--surface)] sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-4">
          <div className="min-w-0">
            <p className="text-xs text-[var(--muted)]">自動化の詳細</p>
            <h2 className="truncate text-lg font-semibold">{automation.name}</h2>
            <p className="text-sm text-[var(--muted)]">
              {AUTOMATION_STATUS_LABEL[automation.status]}
            </p>
          </div>
          <button
            type="button"
            className="min-h-11 min-w-11 rounded-full text-sm"
            onClick={onClose}
          >
            閉じる
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto px-4 py-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <section className="space-y-1 text-sm">
            <h3 className="font-medium">説明</h3>
            <p className="text-[var(--text-secondary)]">
              {automation.description || "説明はまだありません"}
            </p>
          </section>

          <section className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-[var(--muted)]">次回実行</p>
              <p>
                {automation.nextRunAt
                  ? new Date(automation.nextRunAt).toLocaleString("ja-JP")
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-[var(--muted)]">最終実行</p>
              <p>
                {automation.lastRunAt
                  ? new Date(automation.lastRunAt).toLocaleString("ja-JP")
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-[var(--muted)]">成功率</p>
              <p>{successRate != null ? `${successRate}%` : "—"}</p>
            </div>
            <div>
              <p className="text-[var(--muted)]">平均実行時間</p>
              <p>
                {avgDurationMs != null
                  ? `約${Math.max(1, Math.round(avgDurationMs / 1000))}秒`
                  : "—"}
              </p>
            </div>
          </section>

          <section className="space-y-2 text-sm">
            <h3 className="font-medium">Workflow Step</h3>
            <ol className="space-y-2">
              {automation.workflow.steps.map((step) => (
                <li
                  key={step.id}
                  className="rounded-xl bg-[var(--surface-muted)] px-3 py-2"
                >
                  <p className="font-medium">
                    {step.order + 1}. {step.name}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    {step.enabled ? "有効" : "無効"}
                    {step.requiresApproval ? " · 承認あり" : ""}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          <section className="space-y-1 text-sm">
            <h3 className="font-medium">方針</h3>
            <p>実行: {POLICY_LABEL[automation.executionPolicy.mode]}</p>
            <p>
              通知: 成功
              {automation.notificationPolicy.onSuccess ? "ON" : "OFF"} / 失敗
              {automation.notificationPolicy.onFailure ? "ON" : "OFF"} / 入力待ち
              {automation.notificationPolicy.onNeedsInput ? "ON" : "OFF"}
            </p>
            <p>
              Memory:{" "}
              {automation.memoryPolicy.enabled
                ? automation.memoryPolicy.allowedScopes.join("、") || "有効"
                : "未使用"}
            </p>
            <p>
              備考:{" "}
              {automation.instruction.freeformNotes?.slice(0, 200) || "なし"}
            </p>
          </section>

          <section className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">最近のRun</h3>
              <Link
                href={`/automations/runs?automationId=${encodeURIComponent(automation.id)}`}
                className="text-accent underline"
              >
                すべて
              </Link>
            </div>
            {runs.length === 0 ? (
              <p className="text-[var(--muted)]">まだありません</p>
            ) : (
              <ul className="space-y-2">
                {runs.map((run) => (
                  <li key={run.id}>
                    <Link
                      href={`/automations/runs/${encodeURIComponent(run.id)}`}
                      className="flex items-center justify-between gap-2 rounded-xl bg-[var(--surface-muted)] px-3 py-2"
                    >
                      <span>
                        {new Date(run.createdAt).toLocaleString("ja-JP")}
                      </span>
                      <span>{formatRunStatus(run.status)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {recentFailures.length > 0 ? (
            <section className="space-y-2 text-sm">
              <h3 className="font-medium">最近の失敗</h3>
              <ul className="space-y-2">
                {recentFailures.slice(0, 3).map((run) => (
                  <li key={run.id}>
                    <Link
                      href={`/automations/runs/${encodeURIComponent(run.id)}#failure`}
                      className="block rounded-xl bg-[var(--danger)]/10 px-3 py-2"
                    >
                      {run.lastErrorMessage ?? formatRunStatus(run.status)}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="space-y-1 text-xs text-[var(--muted)]">
            <p>{retention.summaryRetention}</p>
            <p>{retention.technicalRetention}</p>
            <p>{retention.artifactNote}</p>
          </section>

          <div className="grid grid-cols-2 gap-2">
            {automation.status === "active" ? (
              <Button
                variant="secondary"
                className="min-h-12"
                disabled={busy}
                onClick={onPause}
              >
                一時停止
              </Button>
            ) : automation.status === "paused" ? (
              <Button
                variant="secondary"
                className="min-h-12"
                disabled={busy}
                onClick={onResume}
              >
                再開
              </Button>
            ) : (
              <span />
            )}
            <Button
              className="min-h-12"
              disabled={busy || automation.status !== "active"}
              onClick={onRun}
            >
              今すぐ実行
            </Button>
            <Button
              variant="secondary"
              className="min-h-12"
              disabled={busy}
              onClick={onDuplicate}
            >
              複製
            </Button>
            <Button
              variant="secondary"
              className="min-h-12"
              disabled={busy}
              onClick={onArchive}
            >
              Archive
            </Button>
            <Link
              href={`/automations/new?edit=${encodeURIComponent(automation.id)}`}
              className="col-span-2 inline-flex min-h-12 items-center justify-center rounded-xl border border-[var(--border)] text-sm"
            >
              編集
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
