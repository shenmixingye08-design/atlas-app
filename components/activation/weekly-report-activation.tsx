"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { ActivationProgress } from "@/components/activation/activation-progress";
import { fetchAutomationsV2 } from "@/lib/automation-platform/client";
import {
  DAY_OPTIONS,
  WEEKLY_REPORT_CONTENT_EXAMPLE,
  WEEKLY_REPORT_DEFAULTS,
  WEEKLY_REPORT_TEMPLATE_ID,
  incrementActivationRetry,
  loadActivationState,
  markActivationSkipped,
  markActivationStarted,
  runWeeklyReportActivation,
  trackActivationEvent,
  type ActivationFailureInfo,
  type ActivationPhase,
  type ActivationResult,
  type ActivationStepId,
  type WeeklyReportConfig,
} from "@/lib/activation";
import { formatNextRunDisplay } from "@/lib/automations/form-utils";
import { completeFirstExperience } from "@/lib/first-experience";
import { cn } from "@/lib/design-system/cn";

export type WeeklyReportActivationProps = {
  /** When true, render as full-page (route). Otherwise modal overlay. */
  embedded?: boolean;
  onComplete?: () => void;
  onSkip?: () => void;
  /** Dev/visual preview only — forces initial step without starting analytics twice. */
  previewStep?: ActivationStepId;
  previewResult?: ActivationResult | null;
};

const HOUR_OPTIONS = [8, 9, 10, 12, 17, 18] as const;

function primaryButtonClass(disabled?: boolean): string {
  return cn(
    "inline-flex w-full min-h-11 items-center justify-center rounded-[var(--radius-md)] px-4 text-sm font-semibold",
    disabled
      ? "cursor-not-allowed bg-[var(--surface-muted)] text-[var(--text-muted)]"
      : "bg-[var(--brand)] text-[var(--brand-foreground)]",
  );
}

function secondaryButtonClass(): string {
  return "inline-flex w-full min-h-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-elevated)] px-4 text-sm font-medium text-[var(--text-primary)]";
}

export function WeeklyReportActivation({
  embedded = false,
  onComplete,
  onSkip,
  previewStep,
  previewResult = null,
}: WeeklyReportActivationProps) {
  const titleId = useId();
  const notesId = useId();
  const startedRef = useRef(false);
  const [step, setStep] = useState<ActivationStepId>(previewStep ?? "choose");
  const [config, setConfig] = useState<WeeklyReportConfig>({
    ...WEEKLY_REPORT_DEFAULTS,
  });
  const [phase, setPhase] = useState<ActivationPhase>(() => {
    if (previewResult) return "succeeded";
    if (previewStep === "run") return "running";
    return "idle";
  });
  const [result, setResult] = useState<ActivationResult | null>(previewResult);
  const [failure, setFailure] = useState<ActivationFailureInfo | null>(null);
  const [automationId, setAutomationId] = useState<string | null>(
    () => loadActivationState().automationId,
  );
  const [elapsedSec, setElapsedSec] = useState<number | null>(
    previewResult ? Math.max(1, Math.round(previewResult.durationMs / 1000)) : null,
  );

  useEffect(() => {
    if (previewStep) return;
    if (startedRef.current) return;
    startedRef.current = true;
    markActivationStarted();
    trackActivationEvent("first_experience_started", {
      templateId: WEEKLY_REPORT_TEMPLATE_ID,
    });
    trackActivationEvent("template_selected", {
      templateId: WEEKLY_REPORT_TEMPLATE_ID,
    });
    trackActivationEvent("activation_step_viewed", { step: "choose" });
  }, [previewStep]);

  useEffect(() => {
    trackActivationEvent("activation_step_viewed", { step });
  }, [step]);

  const nextRunLabel = (() => {
    if (result?.nextRunAt) return formatNextRunDisplay(result.nextRunAt);
    const day =
      DAY_OPTIONS.find((item) => item.value === config.dayOfWeek)?.label ??
      "毎週";
    return `${day} ${String(config.hour).padStart(2, "0")}:${String(config.minute).padStart(2, "0")}`;
  })();

  const finishSuccess = useCallback(
    (activationResult: ActivationResult) => {
      setResult(activationResult);
      setPhase("succeeded");
      setStep("receive");
      try {
        completeFirstExperience({
          taskId: "sales_material",
          jobCategory: "sales_material",
          durationSec: Math.max(
            1,
            Math.round(activationResult.durationMs / 1000),
          ),
          deliverable: {
            title: activationResult.fileName,
            preview: "週次営業報告書を作成しました。",
            format: "Word",
          },
          leadEmployee: "MINERVOT",
          saveLocation: "MINERVOT",
          nextIntegration: {
            label: "自動化を確認",
            href: `/automations?id=${encodeURIComponent(activationResult.automationId)}`,
          },
          usedRealOrchestration: true,
        });
      } catch {
        // profile write is best-effort
      }
      trackActivationEvent("next_run_confirmed", {
        automationId: activationResult.automationId,
        hasNextRun: Boolean(activationResult.nextRunAt),
      });
    },
    [],
  );

  const executeTestRun = useCallback(async () => {
    setPhase("running");
    setFailure(null);
    setStep("run");
    const outcome = await runWeeklyReportActivation({
      config,
      existingAutomationId: automationId,
    });
    if (!outcome.ok) {
      setPhase("failed");
      setFailure(outcome.failure);
      return;
    }

    let nextRunAt = outcome.result.nextRunAt;
    try {
      const automations = await fetchAutomationsV2();
      const match = automations.find(
        (item) => item.id === outcome.result.automationId,
      );
      nextRunAt = match?.nextRunAt ?? nextRunAt;
      setAutomationId(outcome.result.automationId);
    } catch {
      // next run label falls back to schedule copy
    }

    setElapsedSec(Math.max(1, Math.round(outcome.result.durationMs / 1000)));
    finishSuccess({ ...outcome.result, nextRunAt });
  }, [automationId, config, finishSuccess]);

  const handleRetry = useCallback(() => {
    incrementActivationRetry();
    trackActivationEvent("activation_retry_clicked", {
      stage: failure?.stage ?? "unknown",
      diagnosticId: failure?.diagnosticId,
    });
    void executeTestRun();
  }, [executeTestRun, failure?.diagnosticId, failure?.stage]);

  const handleSkip = useCallback(() => {
    markActivationSkipped();
    trackActivationEvent("activation_skipped", {
      step,
      templateId: WEEKLY_REPORT_TEMPLATE_ID,
    });
    onSkip?.();
  }, [onSkip, step]);

  const handleDownload = useCallback(() => {
    if (!result?.downloadUrl) return;
    trackActivationEvent("first_artifact_downloaded", {
      automationId: result.automationId,
      runId: result.runId,
    });
  }, [result]);

  const shellClass = embedded
    ? "mx-auto w-full max-w-lg px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
    : "relative z-[101] w-full max-w-lg rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow-lg)] sm:p-6";

  const content = (
    <div className={shellClass}>
      <div className="mb-5 space-y-3">
        <p className="text-[length:var(--text-label)] font-semibold tracking-[0.08em] text-[var(--brand)]">
          MINERVOT
        </p>
        <ActivationProgress currentStepId={step} />
      </div>

      {step === "choose" ? (
        <section aria-labelledby={titleId} className="space-y-4">
          <h2
            id={titleId}
            className="text-[length:var(--text-section)] font-semibold text-[var(--text-primary)]"
          >
            最初の仕事をMINERVOTへ任せてみましょう
          </h2>
          <p className="text-[length:var(--text-body)] text-[var(--text-secondary)]">
            初回は「毎週の営業レポートをWordで作る」に絞っています。外部連携は不要です。
          </p>
          <div className="rounded-[var(--radius-md)] border border-[var(--brand)] bg-[var(--brand-muted)] p-4 text-left">
            <p className="font-semibold text-[var(--text-primary)]">
              毎週の営業レポート
            </p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              成果物: Word　／　完了時に通知　／　初回はすぐ試し実行
            </p>
          </div>
          <button
            type="button"
            className={primaryButtonClass()}
            onClick={() => setStep("configure")}
          >
            この仕事で始める
          </button>
          <button type="button" className={secondaryButtonClass()} onClick={handleSkip}>
            あとでホームで選ぶ
          </button>
        </section>
      ) : null}

      {step === "configure" ? (
        <section aria-labelledby={titleId} className="space-y-4">
          <h2
            id={titleId}
            className="text-[length:var(--text-section)] font-semibold text-[var(--text-primary)]"
          >
            内容を設定
          </h2>
          <p className="text-[length:var(--text-body)] text-[var(--text-secondary)]">
            そのまま進めても大丈夫です。あとから編集できます。
          </p>

          <label className="block space-y-1.5 text-sm">
            <span className="font-medium text-[var(--text-primary)]">
              自動化名
            </span>
            <input
              value={config.name}
              onChange={(event) =>
                setConfig((prev) => ({ ...prev, name: event.target.value }))
              }
              className="w-full min-h-11 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[var(--text-primary)]"
            />
          </label>

          <label className="block space-y-1.5 text-sm">
            <span className="font-medium text-[var(--text-primary)]">
              実行する曜日
            </span>
            <select
              value={config.dayOfWeek}
              onChange={(event) =>
                setConfig((prev) => ({
                  ...prev,
                  dayOfWeek: Number(event.target.value),
                }))
              }
              className="w-full min-h-11 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[var(--text-primary)]"
            >
              {DAY_OPTIONS.map((day) => (
                <option key={day.value} value={day.value}>
                  {day.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5 text-sm">
            <span className="font-medium text-[var(--text-primary)]">時刻</span>
            <select
              value={config.hour}
              onChange={(event) =>
                setConfig((prev) => ({
                  ...prev,
                  hour: Number(event.target.value),
                  minute: 0,
                }))
              }
              className="w-full min-h-11 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[var(--text-primary)]"
            >
              {HOUR_OPTIONS.map((hour) => (
                <option key={hour} value={hour}>
                  {String(hour).padStart(2, "0")}:00
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5 text-sm" htmlFor={notesId}>
            <span className="font-medium text-[var(--text-primary)]">
              レポートに含めたい内容
            </span>
            <textarea
              id={notesId}
              value={config.contentNotes}
              onChange={(event) =>
                setConfig((prev) => ({
                  ...prev,
                  contentNotes: event.target.value,
                }))
              }
              rows={4}
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--text-primary)]"
            />
            <span className="block text-[length:var(--text-caption)] text-[var(--text-muted)]">
              {WEEKLY_REPORT_CONTENT_EXAMPLE}
            </span>
          </label>

          <button
            type="button"
            className={primaryButtonClass()}
            onClick={() => {
              void executeTestRun();
            }}
          >
            まず一度試してみる
          </button>
          <button
            type="button"
            className={secondaryButtonClass()}
            onClick={() => setStep("choose")}
          >
            戻る
          </button>
        </section>
      ) : null}

      {step === "run" ? (
        <section aria-labelledby={titleId} className="space-y-4">
          <h2
            id={titleId}
            className="text-[length:var(--text-section)] font-semibold text-[var(--text-primary)]"
          >
            {phase === "failed" ? "完了できませんでした" : "試しに実行しています"}
          </h2>

          {phase === "running" || phase === "creating" ? (
            <div
              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-4"
              role="status"
              aria-live="polite"
            >
              <p className="font-medium text-[var(--text-primary)]">
                Word成果物を作成しています…
              </p>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                本物の生成経路で保存まで進めます。サンプルファイルは使いません。
              </p>
              <ul className="mt-3 space-y-1 text-sm text-[var(--text-secondary)]">
                <li>1. 自動化を作成</li>
                <li>2. テスト実行</li>
                <li>3. Word生成と保存</li>
              </ul>
            </div>
          ) : null}

          {phase === "failed" && failure ? (
            <div
              className="space-y-3 rounded-[var(--radius-md)] border border-[var(--error)] bg-[var(--error-bg)] p-4"
              role="alert"
            >
              <p className="font-semibold text-[var(--error)]">
                失敗箇所:{" "}
                {failure.stage === "create"
                  ? "自動化の作成"
                  : failure.stage === "deliverable"
                    ? "成果物の生成"
                    : failure.stage === "storage"
                      ? "保存"
                      : "実行"}
              </p>
              <p className="text-sm text-[var(--text-primary)]">
                {failure.message}
              </p>
              <p className="text-sm text-[var(--text-secondary)]">
                {failure.userCanFix
                  ? "入力内容を直してから再実行できます。"
                  : "自動で再実行できます。続く場合は診断IDをお知らせください。"}
              </p>
              {failure.diagnosticId ? (
                <p className="break-all text-[length:var(--text-caption)] text-[var(--text-muted)]">
                  診断ID: {failure.diagnosticId}
                </p>
              ) : null}
              <div className="flex flex-col gap-2">
                {failure.retryable ? (
                  <button
                    type="button"
                    className={primaryButtonClass()}
                    onClick={handleRetry}
                  >
                    再実行する
                  </button>
                ) : null}
                <button
                  type="button"
                  className={secondaryButtonClass()}
                  onClick={() => {
                    setPhase("idle");
                    setStep("configure");
                  }}
                >
                  入力を修正する
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {step === "receive" && result ? (
        <section aria-labelledby={titleId} className="space-y-4">
          <h2
            id={titleId}
            className="text-[length:var(--text-section)] font-semibold text-[var(--text-primary)]"
          >
            完成しました
          </h2>
          <p className="text-[length:var(--text-body)] text-[var(--text-secondary)]">
            お待たせいたしました。成果物をご用意しました。
          </p>

          <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-left">
            <p className="text-sm text-[var(--text-muted)]">ファイル名</p>
            <p className="font-semibold text-[var(--text-primary)]">
              {result.fileName}
            </p>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              形式: {result.formatLabel}
            </p>
            <p className="text-sm text-[var(--text-secondary)]">
              作成日時: {formatNextRunDisplay(result.createdAt)}
            </p>
          </div>

          <a
            href={result.downloadUrl}
            onClick={handleDownload}
            className={primaryButtonClass()}
          >
            ダウンロード
          </a>
          <Link
            href={`/automations/runs/${encodeURIComponent(result.runId)}`}
            className={secondaryButtonClass()}
          >
            内容を確認
          </Link>

          <div className="rounded-[var(--radius-md)] border border-[var(--brand)] bg-[var(--brand-muted)] p-4 text-left">
            <p className="font-semibold text-[var(--text-primary)]">
              次回から自動で実行します
            </p>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              次回: {nextRunLabel}
            </p>
            <p className="text-sm text-[var(--text-secondary)]">
              通知: 完了時（アプリ内）
            </p>
            <div className="mt-3 flex flex-wrap gap-3 text-sm font-semibold">
              <Link
                href={`/automations?id=${encodeURIComponent(result.automationId)}`}
                className="text-[var(--brand)] underline-offset-2 hover:underline"
              >
                編集 / 一時停止
              </Link>
              <Link
                href={`/automations?id=${encodeURIComponent(result.automationId)}`}
                className="text-[var(--brand)] underline-offset-2 hover:underline"
              >
                自動化詳細
              </Link>
              <button
                type="button"
                className="text-[var(--brand)] underline-offset-2 hover:underline"
                onClick={() => {
                  setPhase("idle");
                  setStep("configure");
                }}
              >
                修正して再生成
              </button>
            </div>
          </div>

          <button
            type="button"
            className={primaryButtonClass()}
            onClick={() => onComplete?.()}
          >
            ホームへ戻る
          </button>
          {elapsedSec !== null ? (
            <p className="text-center text-[length:var(--text-caption)] text-[var(--text-muted)]">
              初回完了まで約 {elapsedSec} 秒
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );

  if (embedded) {
    return (
      <div className="min-h-[100dvh] bg-[var(--background)]">{content}</div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        className="max-h-[100dvh] w-full overflow-y-auto sm:max-h-[90dvh]"
        role="dialog"
        aria-modal
        aria-labelledby={titleId}
      >
        {content}
      </div>
    </div>
  );
}
