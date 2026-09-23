"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { AutomationRun } from "@/lib/automation-platform/types";
import { fetchAutomationRunsAll } from "@/lib/automation-platform/client";
import {
  formatRunHeadline,
  TRIGGER_LABEL,
} from "@/lib/automation-platform/operations/status-labels";
import { PageHeader } from "@/components/automation-first/page-header";
import { cn } from "@/lib/design-system/cn";
import { LoadingState } from "@/components/ui/loading-state";
import {
  RUN_LIST_EMPTY_MESSAGE,
  RUN_LIST_UNAVAILABLE_HINT,
  RUN_LIST_UNAVAILABLE_TITLE,
  runListEmptyMessage,
  type AutomationListLoadState,
} from "@/lib/automations/list-load-state";

const STATUS_FILTERS: Array<{ id: string; label: string; value: string }> = [
  { id: "all", label: "すべて", value: "" },
  { id: "succeeded", label: "完了", value: "succeeded" },
  { id: "failed", label: "完了できず", value: "failed" },
  {
    id: "partial",
    label: "一部完了",
    value: "partially_succeeded",
  },
  { id: "running", label: "実行中", value: "running,queued,retrying,preparing" },
  { id: "approval", label: "確認待ち", value: "awaiting_approval" },
  { id: "input", label: "入力待ち", value: "needs_input" },
];

type RunTone = "success" | "warning" | "danger" | "active" | "neutral";

const RUN_TONE: Record<RunTone, string> = {
  success: "bg-[var(--success-bg)] text-[var(--success)]",
  warning: "bg-[var(--warning-bg)] text-[var(--warning)]",
  danger: "bg-[var(--error-bg)] text-[var(--danger)]",
  active: "bg-[var(--brand-muted)] text-[var(--brand)]",
  neutral: "bg-[var(--surface-muted)] text-[var(--text-secondary)]",
};

const RUN_SHORT_LABEL: Partial<Record<AutomationRun["status"], string>> = {
  succeeded: "完了",
  partially_succeeded: "一部完了",
  failed: "完了できず",
  awaiting_approval: "確認待ち",
  needs_input: "入力待ち",
  running: "実行中",
  queued: "実行待ち",
  preparing: "準備中",
  retrying: "再試行中",
  scheduled: "予定",
  cancelled: "取り消し",
  skipped: "スキップ",
  expired: "期限切れ",
};

function runTone(status: AutomationRun["status"]): RunTone {
  switch (status) {
    case "succeeded":
      return "success";
    case "partially_succeeded":
    case "awaiting_approval":
    case "needs_input":
      return "warning";
    case "failed":
    case "expired":
      return "danger";
    case "running":
    case "queued":
    case "preparing":
    case "retrying":
      return "active";
    default:
      return "neutral";
  }
}

export function RunListPage() {
  const [runs, setRuns] = useState<AutomationRun[] | null>(null);
  const [loadState, setLoadState] =
    useState<AutomationListLoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [hasRetry, setHasRetry] = useState(false);
  const [hasArtifacts, setHasArtifacts] = useState(false);
  const [hasExternal, setHasExternal] = useState(false);

  const load = useCallback(() => {
    void fetchAutomationRunsAll({
      q: query || undefined,
      status: status || undefined,
      hasRetry: hasRetry || undefined,
      hasArtifacts: hasArtifacts || undefined,
      hasExternal: hasExternal || undefined,
      sort: "newest",
    })
      .then((items) => {
        setRuns(items);
        setLoadState("ready");
        setError(null);
      })
      .catch(() => {
        setError(RUN_LIST_UNAVAILABLE_TITLE);
        setLoadState("error");
        setRuns(null);
      });
  }, [query, status, hasRetry, hasArtifacts, hasExternal]);

  useEffect(() => {
    const timer = window.setTimeout(load, 200);
    return () => window.clearTimeout(timer);
  }, [load]);

  const rows = useMemo(() => runs ?? [], [runs]);

  return (
    <div className="space-y-6">
      <Link
        href="/automations"
        className="ui-link gap-1 rounded text-[var(--text-secondary)] focus-ring"
      >
        ← 自動化一覧へ戻る
      </Link>
      <PageHeader
        eyebrow="MINERVOT"
        title="実行履歴"
        description="MINERVOTが実行した仕事の結果と成果物を確認できます。うまくいかなかった仕事は、ここから直せます。"
      />

      <div className="space-y-3">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="自動化名・成果物・手順・診断IDで検索"
          aria-label="実行履歴を検索"
          className="min-h-12 w-full rounded-[var(--radius-lg)] border border-[var(--border)] px-4 text-sm focus:border-[var(--border-focus)] focus:outline-none"
        />
        <div className="flex gap-2 overflow-x-auto pb-1">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setStatus(filter.value)}
              aria-pressed={status === filter.value}
              className={
                status === filter.value
                  ? "ui-chip-btn shrink-0 min-h-10 border-transparent bg-[var(--brand)] text-[var(--brand-foreground)]"
                  : "ui-chip-btn shrink-0 min-h-10"
              }
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-[var(--text-secondary)]">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={hasRetry}
              onChange={(event) => setHasRetry(event.target.checked)}
            />
            再試行あり
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={hasArtifacts}
              onChange={(event) => setHasArtifacts(event.target.checked)}
            />
            成果物あり
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={hasExternal}
              onChange={(event) => setHasExternal(event.target.checked)}
            />
            外部サービスへの反映あり
          </label>
        </div>
      </div>

      {loadState === "error" ? (
        <div className="space-y-3" role="alert">
          <p className="text-sm text-[var(--danger)]">{error}</p>
          <p className="text-sm text-[var(--muted)]">{RUN_LIST_UNAVAILABLE_HINT}</p>
          <button
            type="button"
            className="ui-chip-btn"
            onClick={() => {
              setLoadState("loading");
              setError(null);
              load();
            }}
          >
            再読み込み
          </button>
        </div>
      ) : null}
      {runs === null && loadState !== "error" ? (
        <LoadingState message="実行履歴を読み込んでいます…" />
      ) : null}

      {runListEmptyMessage(loadState, rows.length) ? (
        <p className="ui-card ui-card-pad text-sm text-[var(--muted)]">{RUN_LIST_EMPTY_MESSAGE}</p>
      ) : null}

      <ul className="space-y-2.5">
        {rows.map((run) => {
          const failedSteps = run.steps.filter(
            (step) => step.status === "failed",
          ).length;
          const retries = Math.max(0, run.attemptCount - 1);
          const approvalPending =
            run.approval?.status === "pending" || run.status === "awaiting_approval";
          const meta = [
            run.durationMs != null
              ? `${Math.max(1, Math.round(run.durationMs / 1000))}秒`
              : null,
            run.artifacts.length > 0 ? `成果物 ${run.artifacts.length}件` : null,
            failedSteps > 0 ? `失敗した手順 ${failedSteps}` : null,
            retries > 0 ? `再試行 ${retries}回` : null,
            approvalPending && run.status !== "awaiting_approval"
              ? "確認待ち"
              : run.approval?.status === "approved"
                ? "確認済み"
                : null,
            run.memoryUsage.used.length > 0 ? "好みを反映" : null,
          ].filter(Boolean);
          return (
            <li key={run.id}>
              <Link
                href={`/automations/runs/${encodeURIComponent(run.id)}`}
                className="ui-card ui-card-interactive block px-4 py-3.5 focus-ring"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                      {run.automationName}
                    </p>
                    <p className="mt-0.5 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                      {new Date(
                        run.completedAt ?? run.startedAt ?? run.createdAt,
                      ).toLocaleString("ja-JP", {
                        month: "numeric",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {" · "}
                      {TRIGGER_LABEL[run.triggerType]}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-1 text-[length:var(--text-meta)] font-semibold",
                      RUN_TONE[runTone(run.status)],
                    )}
                  >
                    {RUN_SHORT_LABEL[run.status] ?? formatRunHeadline(run)}
                  </span>
                </div>
                {meta.length > 0 ? (
                  <p className="mt-2 text-[length:var(--text-caption)] text-[var(--text-secondary)]">
                    {meta.join(" · ")}
                  </p>
                ) : null}
                <p className="mt-1.5 break-all text-[length:var(--text-meta)] text-[var(--text-muted)]">
                  診断ID {run.diagnosticId}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
