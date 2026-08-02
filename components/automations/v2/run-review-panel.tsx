"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";

import type { AutomationRun } from "@/lib/automation-platform/types";
import {
  approveAutomationRun,
  fetchAutomationRun,
  rejectAutomationRun,
  retryAutomationRun,
} from "@/lib/automation-platform/client";
import { Button } from "@/components/ui/button";

const STATUS_LABEL: Record<AutomationRun["status"], string> = {
  scheduled: "予約済み",
  preparing: "準備中",
  awaiting_approval: "確認待ち",
  queued: "実行待ち",
  running: "実行中",
  retrying: "再試行待ち",
  needs_input: "入力待ち",
  succeeded: "完了",
  partially_succeeded: "一部完了",
  failed: "失敗",
  skipped: "スキップ",
  cancelled: "キャンセル",
  expired: "期限切れ",
};

function StepIcon({ status }: { status: AutomationRun["steps"][number]["status"] }) {
  if (status === "succeeded") return <span className="text-[var(--success,#1a7f4b)]">完了</span>;
  if (status === "running" || status === "retrying")
    return <span className="text-[var(--accent)]">実行中</span>;
  if (status === "failed") return <span className="text-[var(--danger)]">失敗</span>;
  if (status === "waiting_approval") return <span>確認</span>;
  if (status === "skipped") return <span className="text-[var(--muted)]">略</span>;
  return <span className="text-[var(--muted)]">待機</span>;
}

export function RunReviewPanel({
  runId,
  initialRun,
}: {
  runId: string;
  initialRun?: AutomationRun | null;
}) {
  const [run, setRun] = useState<AutomationRun | null>(initialRun ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reload = useCallback(async () => {
    const next = await fetchAutomationRun(runId);
    setRun(next);
  }, [runId]);

  useEffect(() => {
    if (initialRun) return;
    let cancelled = false;
    void fetchAutomationRun(runId)
      .then((next) => {
        if (!cancelled) setRun(next);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [runId, initialRun]);

  useEffect(() => {
    if (!run) return;
    if (!["running", "queued", "retrying", "preparing"].includes(run.status)) {
      return;
    }
    const timer = window.setInterval(() => {
      void reload().catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [run, reload]);

  const onApprove = () => {
    startTransition(async () => {
      try {
        const next = await approveAutomationRun(runId);
        setRun(next);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "承認に失敗しました");
      }
    });
  };

  const onReject = () => {
    startTransition(async () => {
      try {
        const next = await rejectAutomationRun(runId);
        setRun(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : "却下に失敗しました");
      }
    });
  };

  const onRetry = () => {
    startTransition(async () => {
      try {
        const next = await retryAutomationRun(runId);
        setRun(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : "再実行に失敗しました");
      }
    });
  };

  if (error && !run) {
    return <p className="p-4 text-sm text-[var(--danger)]">{error}</p>;
  }
  if (!run) {
    return <p className="p-4 text-sm text-[var(--muted)]">読み込み中…</p>;
  }

  const preparation = run.preparation;
  const canApprove =
    run.status === "awaiting_approval" || run.status === "needs_input";
  const canRetry =
    run.status === "failed" ||
    run.status === "partially_succeeded" ||
    run.status === "retrying";

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-5 px-4 pb-24 pt-4">
      <header className="space-y-1">
        <p className="text-xs text-[var(--muted)]">実行レビュー</p>
        <h1 className="text-xl font-semibold tracking-tight">
          {run.automationName}
        </h1>
        <p className="text-sm text-[var(--muted)]">
          {STATUS_LABEL[run.status]}
          {preparation?.scheduledLabel ? ` · ${preparation.scheduledLabel}` : ""}
        </p>
      </header>

      {preparation ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">今回やること</h2>
          <pre className="whitespace-pre-wrap rounded-2xl bg-[var(--surface-muted)] p-4 text-sm leading-relaxed">
            {preparation.summary}
          </pre>
          <p className="text-xs text-[var(--muted)]">
            推定時間: {preparation.estimatedDurationLabel} · タイムゾーン:{" "}
            {preparation.timezone}
          </p>
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-sm font-medium">実行状況</h2>
        <ol className="space-y-2">
          {run.steps.map((step) => (
            <li
              key={step.id}
              className="flex items-start gap-3 rounded-2xl bg-[var(--surface-muted)] px-3 py-3 text-sm"
            >
              <span className="mt-0.5 w-14 shrink-0 text-xs">
                <StepIcon status={step.status} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{step.name}</p>
                {step.outputSummary ? (
                  <p className="text-xs text-[var(--muted)]">{step.outputSummary}</p>
                ) : null}
                {step.errorMessage ? (
                  <p className="text-xs text-[var(--danger)]">{step.errorMessage}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-2 text-sm">
        <h2 className="text-sm font-medium">詳細</h2>
        <ul className="space-y-1 text-[var(--muted)]">
          <li>
            成果物:{" "}
            {run.artifacts.length > 0
              ? run.artifacts.map((a) => a.label).join("、")
              : "なし"}
          </li>
          <li>
            外部サービス:{" "}
            {preparation?.externalEffects?.length
              ? preparation.externalEffects.join("、")
              : "なし"}
          </li>
          <li>
            使用した記憶:{" "}
            {run.memoryUsage.used.length > 0
              ? run.memoryUsage.used.map((m) => m.scope).join("、")
              : "なし"}
          </li>
          <li>
            更新した記憶:{" "}
            {run.memoryUsage.updated.length > 0
              ? run.memoryUsage.updated.map((m) => m.scope).join("、")
              : "なし（自動更新しません）"}
          </li>
          {run.durationMs != null ? (
            <li>実行時間: {Math.round(run.durationMs / 1000)}秒</li>
          ) : null}
          {run.approval ? (
            <li>
              承認: {run.approval.status}
              {run.approval.decidedAt
                ? `（${new Date(run.approval.decidedAt).toLocaleString("ja-JP")}）`
                : ""}
            </li>
          ) : null}
        </ul>
      </section>

      {run.status === "failed" || run.status === "partially_succeeded" ? (
        <section className="space-y-2 rounded-2xl bg-[var(--surface-muted)] p-4 text-sm">
          <h2 className="font-medium">失敗情報</h2>
          <p>原因: {run.lastErrorMessage ?? "不明"}</p>
          <p>
            停止位置:{" "}
            {run.steps.find((s) => s.id === run.failedStepId)?.name ?? "不明"}
          </p>
          <p>再試行可能: {run.retryable ? "はい" : "いいえ"}</p>
          <p>入力必要: {run.needsUserInput ? "はい" : "いいえ"}</p>
        </section>
      ) : null}

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--border)] bg-[var(--surface)]/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-lg gap-2">
          {canApprove ? (
            <>
              <Button
                className="min-h-12 flex-1"
                disabled={pending}
                onClick={onApprove}
              >
                承認して実行
              </Button>
              <Button
                variant="secondary"
                className="min-h-12"
                disabled={pending}
                onClick={onReject}
              >
                却下
              </Button>
            </>
          ) : null}
          {canRetry ? (
            <Button
              className="min-h-12 flex-1"
              disabled={pending}
              onClick={onRetry}
            >
              編集せず再実行
            </Button>
          ) : null}
          <Link
            href={`/automations?id=${encodeURIComponent(run.automationId)}`}
            className="inline-flex min-h-12 items-center justify-center rounded-xl px-3 text-sm text-[var(--muted)]"
          >
            一覧へ
          </Link>
        </div>
      </div>
    </div>
  );
}
