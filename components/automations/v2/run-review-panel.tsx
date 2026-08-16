"use client";

import { scheduleMountWork } from "@/lib/react/schedule-mount-work";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";

import type { AutomationRun } from "@/lib/automation-platform/types";
import {
  approveAutomationRun,
  cancelAutomationRun,
  fetchAutomationRun,
  rejectAutomationRun,
  resumeAutomationRunAfterInput,
  retryAutomationRun,
  retryAutomationRunStep,
} from "@/lib/automation-platform/client";
import { buildFailureUserView } from "@/lib/automation-platform/operations/failure-view";
import { describeNeedsInput } from "@/lib/automation-platform/operations/needs-input";
import { buildRunProgressView } from "@/lib/automation-platform/operations/progress";
import {
  formatRunStatus,
  formatStepStatus,
  TRIGGER_LABEL,
} from "@/lib/automation-platform/operations/status-labels";
import { buildRunTimeline } from "@/lib/automation-platform/operations/timeline";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/design-system/cn";

function StepMarker({
  marker,
}: {
  marker: "done" | "active" | "waiting" | "failed" | "retrying";
}) {
  if (marker === "done") {
    return <span className="text-[var(--success,#1a7f4b)]">完了</span>;
  }
  if (marker === "active") {
    return <span className="text-[var(--accent)]">実行</span>;
  }
  if (marker === "failed") {
    return <span className="text-[var(--danger)]">失敗</span>;
  }
  if (marker === "retrying") {
    return <span className="text-[var(--warning,#b45309)]">再試</span>;
  }
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
  const [showTechnical, setShowTechnical] = useState(false);
  const [inputNote, setInputNote] = useState("");
  const [approveLocked, setApproveLocked] = useState(false);
  const [pending, startTransition] = useTransition();
  const approveLockRef = useRef(false);

  const reload = useCallback(async () => {
    const next = await fetchAutomationRun(runId);
    setRun(next);
  }, [runId]);

  useEffect(() => {
    return scheduleMountWork(() => {
      approveLockRef.current = false;
      setApproveLocked(false);
    });
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

  const timeline = useMemo(
    () => (run ? buildRunTimeline(run) : []),
    [run],
  );
  const progress = useMemo(
    () => (run ? buildRunProgressView(run) : null),
    [run],
  );
  const failureView = useMemo(
    () =>
      run &&
      (run.status === "failed" ||
        run.status === "partially_succeeded" ||
        run.status === "needs_input")
        ? buildFailureUserView(run)
        : null,
    [run],
  );

  const onApprove = () => {
    if (approveLockRef.current || pending) return;
    approveLockRef.current = true;
    setApproveLocked(true);
    startTransition(async () => {
      try {
        const next = await approveAutomationRun(runId);
        setRun(next);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "承認に失敗しました");
        approveLockRef.current = false;
        setApproveLocked(false);
      }
    });
  };

  const onReject = () => {
    if (pending) return;
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
    if (pending) return;
    startTransition(async () => {
      try {
        const next = await retryAutomationRun(runId);
        setRun(next);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "再実行に失敗しました");
      }
    });
  };

  const onCancel = () => {
    if (pending) return;
    const reason = window.prompt("キャンセル理由（任意）") ?? "";
    startTransition(async () => {
      try {
        const next = await cancelAutomationRun(runId, reason || undefined);
        setRun(next);
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "キャンセルに失敗しました",
        );
      }
    });
  };

  const onResumeInput = () => {
    if (pending) return;
    startTransition(async () => {
      try {
        const next = await resumeAutomationRunAfterInput(
          runId,
          inputNote.trim() ? { note: inputNote.trim() } : undefined,
        );
        setRun(next);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "再開に失敗しました");
      }
    });
  };

  const onRetryStep = (stepId: string, mode: "failed_only" | "from_failed") => {
    if (pending) return;
    startTransition(async () => {
      try {
        const next = await retryAutomationRunStep(runId, stepId, mode);
        setRun(next);
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "手順の再実行に失敗しました",
        );
      }
    });
  };

  if (error && !run) {
    return <p className="p-4 text-sm text-[var(--danger)]">{error}</p>;
  }
  if (!run || !progress) {
    return <p className="p-4 text-sm text-[var(--muted)]">読み込み中…</p>;
  }

  const preparation = run.preparation;
  const canApprove =
    run.status === "awaiting_approval" || run.status === "needs_input";
  const canRetry =
    run.status === "failed" ||
    run.status === "partially_succeeded" ||
    run.status === "retrying";
  const canCancel = ![
    "succeeded",
    "cancelled",
    "expired",
    "skipped",
  ].includes(run.status);
  const failedStepId = run.failedStepId;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-5 px-4 pb-[calc(7.5rem+env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <header className="space-y-1">
        <p className="text-xs text-[var(--muted)]">実行の詳細</p>
        <h1 className="text-xl font-semibold tracking-tight">
          {run.automationName}
        </h1>
        <p className="text-sm text-[var(--muted)]">
          {formatRunStatus(run.status)}
          {" · "}
          {TRIGGER_LABEL[run.triggerType]}
          {preparation?.scheduledLabel ? ` · ${preparation.scheduledLabel}` : ""}
        </p>
      </header>

      {run.status === "partially_succeeded" && failureView ? (
        <section
          id="failure"
          className="rounded-2xl border border-[var(--warning,#b45309)]/30 bg-[var(--surface-muted)] p-4 text-sm"
        >
          <h2 className="font-medium">一部成功</h2>
          <p className="mt-2">{failureView.headline}</p>
          <p className="mt-2 text-[var(--muted)]">
            成功した成果物はダウンロードできます。失敗した手順だけ安全に再実行できます。
          </p>
        </section>
      ) : null}

      {run.status === "needs_input" || run.needsUserInput ? (
        <section
          id="needs-input"
          className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
        >
          <h2 className="text-sm font-medium">
            {/自動作成に失敗|x_post_generation_failed/.test(
              `${run.lastErrorMessage ?? ""} ${run.failedStepId ?? ""}`,
            )
              ? "本文作成に失敗しました"
              : "入力が必要です"}
          </h2>
          <p className="text-sm">{describeNeedsInput(run)}</p>
          <label className="block text-sm">
            <span className="text-[var(--muted)]">追記（任意）</span>
            <textarea
              value={inputNote}
              onChange={(event) => setInputNote(event.target.value)}
              className="mt-1 min-h-24 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3"
              placeholder="不足情報を入力してください"
            />
          </label>
          <Button
            className="min-h-12 w-full"
            disabled={pending}
            onClick={onResumeInput}
          >
            入力して途中から再開
          </Button>
        </section>
      ) : null}

      {preparation && run.status === "awaiting_approval" ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">承認内容</h2>
          {preparation.generatedXPostText ? (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-xs text-[var(--muted)]">
                今回MINERVOTが作成した投稿本文です。入力は不要です。内容をご確認ください。
              </p>
              <pre className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                {preparation.generatedXPostText}
              </pre>
            </div>
          ) : null}
          <pre className="whitespace-pre-wrap rounded-2xl bg-[var(--surface-muted)] p-4 text-sm leading-relaxed">
            {preparation.summary}
          </pre>
          <ul className="space-y-1 text-sm text-[var(--muted)]">
            <li>
              外部送信・投稿:{" "}
              {preparation.externalEffects.length > 0
                ? preparation.externalEffects.join("、")
                : "なし"}
            </li>
            <li>
              承認期限:{" "}
              {run.approvalExpiresAt
                ? new Date(run.approvalExpiresAt).toLocaleString("ja-JP")
                : "なし"}
            </li>
            <li>
              リスク:{" "}
              {preparation.plannedSteps.some((step) => step.highRisk)
                ? "高リスク手順を含みます"
                : "通常"}
            </li>
            <li>
              使用する記憶:{" "}
              {run.memoryUsage.used.length > 0
                ? run.memoryUsage.used.map((m) => m.scope).join("、")
                : "なし"}
            </li>
          </ul>
        </section>
      ) : preparation ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">今回やること</h2>
          <pre className="whitespace-pre-wrap rounded-2xl bg-[var(--surface-muted)] p-4 text-sm leading-relaxed">
            {preparation.summary}
          </pre>
        </section>
      ) : null}

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium">進捗</h2>
          <p className="text-xs text-[var(--muted)]">
            最終更新{" "}
            {new Date(progress.lastUpdatedAt).toLocaleTimeString("ja-JP", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
        {progress.currentStepName ? (
          <p className="text-sm">現在: {progress.currentStepName}</p>
        ) : null}
        {progress.estimatedRemainingLabel ? (
          <p className="text-xs text-[var(--muted)]">
            {progress.estimatedRemainingLabel}
          </p>
        ) : null}
        <ol className="space-y-2">
          {progress.items.map((item) => (
            <li
              key={item.id}
              id={item.id === failedStepId ? "failed-step" : undefined}
              className={cn(
                "flex items-start gap-3 rounded-2xl px-3 py-3 text-sm",
                item.marker === "failed"
                  ? "bg-[var(--danger)]/10"
                  : "bg-[var(--surface-muted)]",
              )}
            >
              <span className="mt-0.5 w-10 shrink-0 text-center text-xs">
                <StepMarker marker={item.marker} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{item.name}</p>
                <p className="text-xs text-[var(--muted)]">{item.statusLabel}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">タイムライン</h2>
        <ol className="space-y-3 border-l border-[var(--border)] pl-4">
          {timeline.map((entry) => (
            <li key={entry.id} className="relative text-sm">
              <span className="absolute -left-[1.3rem] top-1 h-2 w-2 rounded-full bg-accent" />
              <p className="tabular-nums text-xs text-[var(--muted)]">
                {entry.timeLabel}
              </p>
              <p className="font-medium">{entry.title}</p>
              {entry.detail ? (
                <p className="break-words text-[var(--muted)]">{entry.detail}</p>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      <section id="artifacts" className="space-y-2">
        <h2 className="text-sm font-medium">成果物</h2>
        {run.artifacts.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">まだありません</p>
        ) : (
          <ul className="space-y-2">
            {run.artifacts.map((artifact) => (
              <li
                key={artifact.id}
                id={`artifact-${artifact.id}`}
                className="rounded-2xl bg-[var(--surface-muted)] px-3 py-3 text-sm"
              >
                <p className="font-medium">{artifact.label}</p>
                <p className="text-xs text-[var(--muted)]">{artifact.kind}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {artifact.url ? (
                    <>
                      <a
                        href={artifact.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent underline"
                      >
                        開く / ダウンロード
                      </a>
                    </>
                  ) : (
                    <span className="text-xs text-[var(--muted)]">
                      保存先リンクはまだありません
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2 text-sm">
        <h2 className="text-sm font-medium">手順の詳細</h2>
        <ul className="space-y-2">
          {run.steps.map((step) => (
            <li
              key={step.id}
              className="rounded-2xl bg-[var(--surface-muted)] px-3 py-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{step.name}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {formatStepStatus(step.status)}
                    {step.startedAt
                      ? ` · 開始 ${new Date(step.startedAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}`
                      : ""}
                    {step.completedAt
                      ? ` · 終了 ${new Date(step.completedAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}`
                      : ""}
                    {step.attemptCount > 1
                      ? ` · 再試行 ${step.attemptCount - 1}回`
                      : ""}
                  </p>
                  {step.outputSummary ? (
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {step.outputSummary}
                    </p>
                  ) : null}
                  {step.errorMessage ? (
                    <p className="mt-1 break-words text-xs text-[var(--danger)]">
                      {step.errorMessage}
                    </p>
                  ) : null}
                </div>
              </div>
              {canRetry && step.status === "failed" ? (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Button
                    variant="secondary"
                    className="min-h-11"
                    disabled={pending}
                    onClick={() => onRetryStep(step.id, "failed_only")}
                  >
                    この手順だけ再実行
                  </Button>
                  <Button
                    variant="secondary"
                    className="min-h-11"
                    disabled={pending}
                    onClick={() => onRetryStep(step.id, "from_failed")}
                  >
                    この手順以降を再実行
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {failureView && run.status !== "needs_input" ? (
        <section
          id="failure"
          className="space-y-2 rounded-2xl bg-[var(--surface-muted)] p-4 text-sm"
        >
          <h2 className="font-medium">失敗の説明</h2>
          <p>{failureView.headline}</p>
          <ul className="space-y-1 text-[var(--muted)]">
            <li>失敗した手順: {failureView.failedStepName ?? "不明"}</li>
            <li>
              失敗時刻:{" "}
              {failureView.failedAt
                ? new Date(failureView.failedAt).toLocaleString("ja-JP")
                : "—"}
            </li>
            <li>原因: {failureView.userCause}</li>
            <li>
              一時的 / 恒久的:{" "}
              {failureView.temporality === "transient"
                ? "一時的な可能性"
                : failureView.temporality === "permanent"
                  ? "設定や権限の確認が必要"
                  : "判定中"}
            </li>
            <li>再試行済み: {failureView.retryCount}回</li>
            <li>
              自動復旧: {failureView.autoRecoverable ? "予定あり" : "なし"}
            </li>
            <li>
              入力必要: {failureView.needsInput ? "はい" : "いいえ"}
            </li>
            <li>
              連携再接続: {failureView.needsReconnect ? "必要" : "不要"}
            </li>
            <li>
              成功済み手順:{" "}
              {failureView.succeededSteps.length > 0
                ? failureView.succeededSteps.map((s) => s.name).join("、")
                : "なし"}
            </li>
          </ul>
          <button
            type="button"
            className="text-sm text-accent underline"
            onClick={() => setShowTechnical((value) => !value)}
          >
            {showTechnical ? "技術診断を隠す" : "技術診断を表示"}
          </button>
          {showTechnical ? (
            <dl className="mt-2 space-y-1 rounded-xl bg-[var(--surface)] p-3 text-xs">
              <div>
                <dt className="text-[var(--muted)]">userCode</dt>
                <dd>{failureView.technical.userCode ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">diagnosticId</dt>
                <dd className="break-all">
                  {failureView.technical.diagnosticId}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">requestId</dt>
                <dd className="break-all">
                  {failureView.technical.requestId}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">failedStage</dt>
                <dd>{failureView.technical.failedStage ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">retryCount</dt>
                <dd>{failureView.technical.retryCount}</dd>
              </div>
            </dl>
          ) : null}
        </section>
      ) : null}

      <section className="space-y-1 text-sm text-[var(--muted)]">
        <p>
          実行時間:{" "}
          {run.durationMs != null
            ? `${Math.round(run.durationMs / 1000)}秒`
            : "—"}
        </p>
        <p>再試行回数: {Math.max(0, run.attemptCount - 1)}</p>
        <p>成果物数: {run.artifacts.length}</p>
        <p>
          記憶利用:{" "}
          {run.memoryUsage.used.length > 0 ? "あり" : "なし"}
        </p>
      </section>

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--border)] bg-[var(--surface)]/95 px-4 pt-3 backdrop-blur pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-lg flex-wrap gap-2">
          {canApprove && run.status === "awaiting_approval" ? (
            <>
              <Button
                className="min-h-12 min-w-[8rem] flex-1"
                disabled={pending || approveLocked}
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
                拒否
              </Button>
            </>
          ) : null}
          {canRetry ? (
            <Button
              className="min-h-12 min-w-[8rem] flex-1"
              disabled={pending}
              onClick={onRetry}
            >
              安全に再実行
            </Button>
          ) : null}
          {canCancel ? (
            <Button
              variant="secondary"
              className="min-h-12"
              disabled={pending}
              onClick={onCancel}
            >
              キャンセル
            </Button>
          ) : null}
          <Link
            href={`/automations?id=${encodeURIComponent(run.automationId)}`}
            className="inline-flex min-h-12 items-center justify-center rounded-xl px-3 text-sm text-[var(--muted)]"
          >
            自動化へ
          </Link>
        </div>
      </div>
    </div>
  );
}
