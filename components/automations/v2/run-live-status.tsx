"use client";

import type { AutomationRun } from "@/lib/automation-platform/types";
import { formatRunStatus } from "@/lib/automation-platform/operations/status-labels";
import { estimateRemainingLabel } from "@/lib/automation-platform/operations/progress";

/**
 * Mobile-first live status for scheduled/manual runs:
 * queued / running / retry / completed / failed + remaining estimate.
 */
export function RunLiveStatus({ run }: { run: AutomationRun }) {
  const remaining = estimateRemainingLabel(run);
  const phase =
    run.status === "queued"
      ? "queued"
      : run.status === "running" || run.status === "preparing"
        ? "running"
        : run.status === "retrying"
          ? "retry"
          : run.status === "succeeded" || run.status === "partially_succeeded"
            ? "completed"
            : run.status === "failed"
              ? "failed"
              : run.status;

  return (
    <section
      className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-4"
      data-testid="run-live-status"
      data-phase={phase}
      aria-live="polite"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--brand)]">
        実行状態
      </p>
      <p className="mt-1 text-base font-semibold text-[var(--text-primary)]">
        {formatRunStatus(run.status)}
      </p>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        {phase === "queued" && "順番待ちです。まもなく開始します。"}
        {phase === "running" && "処理を実行しています。途中で止まっても自動復旧します。"}
        {phase === "retry" && "一時的な障害のため再試行待ちです。"}
        {phase === "completed" && "成果物の受け取りが可能です。"}
        {phase === "failed" &&
          (run.lastErrorMessage || "完了できませんでした。再実行できます。")}
        {!["queued", "running", "retry", "completed", "failed"].includes(
          phase,
        ) && formatRunStatus(run.status)}
      </p>
      {remaining ? (
        <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
          {remaining}
        </p>
      ) : null}
      {run.attemptCount > 0 ? (
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          再試行回数: {run.attemptCount}
        </p>
      ) : null}
    </section>
  );
}
