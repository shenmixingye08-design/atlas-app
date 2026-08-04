"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { AutomationRun } from "@/lib/automation-platform/types";
import { fetchAutomationRunsAll } from "@/lib/automation-platform/client";
import {
  formatRunStatus,
  TRIGGER_LABEL,
} from "@/lib/automation-platform/operations/status-labels";
import { PageHeader } from "@/components/automation-first/page-header";
import { LoadingState } from "@/components/ui/loading-state";

const STATUS_FILTERS: Array<{ id: string; label: string; value: string }> = [
  { id: "all", label: "すべて", value: "" },
  { id: "succeeded", label: "完了", value: "succeeded" },
  { id: "failed", label: "完了不可", value: "failed" },
  {
    id: "partial",
    label: "一部完了",
    value: "partially_succeeded",
  },
  { id: "running", label: "実行中", value: "running,queued,retrying,preparing" },
  { id: "approval", label: "確認待ち", value: "awaiting_approval" },
  { id: "input", label: "確認待ち", value: "needs_input" },
];

export function RunListPage() {
  const [runs, setRuns] = useState<AutomationRun[] | null>(null);
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
        setError(null);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "実行履歴を読み込めませんでした",
        );
        setRuns([]);
      });
  }, [query, status, hasRetry, hasArtifacts, hasExternal]);

  useEffect(() => {
    const timer = window.setTimeout(load, 200);
    return () => window.clearTimeout(timer);
  }, [load]);

  const rows = useMemo(() => runs ?? [], [runs]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-4">
      <PageHeader
        eyebrow="MINERVOT"
        title="実行履歴"
        description="Runの状態・成果物・診断IDを検索して復旧できます。"
        actions={
          <Link href="/automations" className="text-sm text-accent underline">
            自動化一覧
          </Link>
        }
      />

      <div className="space-y-3">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="自動化名・Run ID・diagnosticId・成果物・手順"
          className="min-h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm"
        />
        <div className="flex gap-2 overflow-x-auto pb-1">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setStatus(filter.value)}
              className={
                status === filter.value
                  ? "min-h-10 shrink-0 rounded-full bg-accent px-3 text-sm text-white"
                  : "min-h-10 shrink-0 rounded-full bg-[var(--surface-muted)] px-3 text-sm"
              }
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={hasRetry}
              onChange={(event) => setHasRetry(event.target.checked)}
            />
            retryあり
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
            外部実行あり
          </label>
        </div>
      </div>

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      {runs === null ? <LoadingState message="実行履歴を読み込んでいます…" /> : null}

      {runs && rows.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">該当する実行はありません。</p>
      ) : null}

      <ul className="space-y-3">
        {rows.map((run) => {
          const succeededSteps = run.steps.filter(
            (step) => step.status === "succeeded",
          ).length;
          const failedSteps = run.steps.filter(
            (step) => step.status === "failed",
          ).length;
          return (
            <li key={run.id}>
              <Link
                href={`/automations/runs/${encodeURIComponent(run.id)}`}
                className="block rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      {run.automationName}
                    </p>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {new Date(
                        run.completedAt ?? run.startedAt ?? run.createdAt,
                      ).toLocaleString("ja-JP")}
                      {" · "}
                      {TRIGGER_LABEL[run.triggerType]}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[var(--surface-muted)] px-3 py-1 text-xs">
                    {formatRunStatus(run.status)}
                  </span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-[var(--muted)] sm:grid-cols-3">
                  <div>
                    <dt>実行時間</dt>
                    <dd>
                      {run.durationMs != null
                        ? `${Math.round(run.durationMs / 1000)}秒`
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>成功 / 失敗 Step</dt>
                    <dd>
                      {succeededSteps} / {failedSteps}
                    </dd>
                  </div>
                  <div>
                    <dt>retry</dt>
                    <dd>{Math.max(0, run.attemptCount - 1)}</dd>
                  </div>
                  <div>
                    <dt>成果物</dt>
                    <dd>{run.artifacts.length}</dd>
                  </div>
                  <div>
                    <dt>承認</dt>
                    <dd>
                      {run.approval?.status === "pending" ||
                      run.status === "awaiting_approval"
                        ? "あり"
                        : run.approval?.status === "approved"
                          ? "済み"
                          : "なし"}
                    </dd>
                  </div>
                  <div>
                    <dt>Memory</dt>
                    <dd>
                      {run.memoryUsage.used.length > 0 ? "利用" : "なし"}
                    </dd>
                  </div>
                  <div className="col-span-2 sm:col-span-3">
                    <dt>diagnosticId</dt>
                    <dd className="break-all">{run.diagnosticId}</dd>
                  </div>
                </dl>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
