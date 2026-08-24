"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { getOnboardingState } from "@/lib/onboarding";
import {
  completeFirstExperience,
  deferFirstExperience,
  getFirstExperienceTask,
  getFirstRunClarityTasks,
  getRecommendedFirstExperienceTaskId,
  runFirstExperienceTask,
  type FirstExperienceEmployeeStep,
  type FirstExperienceResult,
  type FirstExperienceTaskId,
} from "@/lib/first-experience";
import {
  buildTimeSavedBreakdown,
  formatMeasuredDuration,
  formatSavedAmount,
} from "@/lib/product-clarity/time-saved";
import { cn } from "@/lib/design-system/cn";
import { ui } from "@/lib/i18n";

type ExperienceStep = "select" | "running" | "complete" | "failed";

const HONEST_FIRST_TASKS = new Set<FirstExperienceTaskId>(["sns", "sales_material"]);

type FirstSuccessExperienceProps = {
  onComplete: () => void;
  onDefer: () => void;
};

function ReferralInvite() {
  const [url, setUrl] = useState<string | null>(null);
  const [reward, setReward] = useState("未設定");
  const [error, setError] = useState<string | null>(null);

  async function issue() {
    setError(null);
    const response = await fetch("/api/growth/referral", { method: "POST" });
    const body = (await response.json()) as { url?: string; reward?: string; error?: string };
    if (!response.ok) {
      setError(body.error ?? "紹介リンクを発行できませんでした");
      return;
    }
    setUrl(body.url ?? null);
    if (body.reward) setReward(body.reward);
  }

  return (
    <div className="mt-5 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] p-4 text-sm">
      <p className="font-medium">紹介リンク</p>
      <p className="mt-1 text-xs text-[var(--foreground-muted)]">
        初回成功後に、明示操作で発行します。特典は{reward}。個人情報はURLに含めません。
      </p>
      {url ? (
        <p className="mt-2 break-all text-xs">{url}</p>
      ) : (
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => void issue()}>
          紹介リンクを発行する
        </Button>
      )}
      {error ? <p className="mt-2 text-xs text-[var(--error)]">{error}</p> : null}
    </div>
  );
}

function ProgressBlocks({ filled, total }: { filled: number; total: number }) {
  return (
    <div className="flex gap-1" aria-label={ui.firstExperience.progressLabel(filled, total)}>
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          className={cn(
            "h-2 flex-1 rounded-sm transition-all duration-500",
            index < filled ? "bg-accent" : "bg-[var(--background-subtle)]",
          )}
        />
      ))}
    </div>
  );
}

export function FirstSuccessExperience({ onComplete, onDefer }: FirstSuccessExperienceProps) {
  const [step, setStep] = useState<ExperienceStep>("select");
  const [visible, setVisible] = useState(false);
  // Pre-select recommended job so first completion is one tap (no effect setState).
  const [selectedTask, setSelectedTask] = useState<FirstExperienceTaskId | null>(
    () => {
      const recommended = getRecommendedFirstExperienceTaskId(
        getOnboardingState().preferredTasks,
      );
      return HONEST_FIRST_TASKS.has(recommended) ? recommended : "sns";
    },
  );
  const [customText, setCustomText] = useState("");
  const [progressFilled, setProgressFilled] = useState(0);
  const [employeeStep, setEmployeeStep] = useState<FirstExperienceEmployeeStep | null>(null);
  const [result, setResult] = useState<FirstExperienceResult | null>(null);
  const [running, setRunning] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const [failMessage, setFailMessage] = useState<string | null>(null);
  const [remainingAi, setRemainingAi] = useState<{
    used: number;
    limit: number;
    remaining: number;
  } | null>(null);

  const preferred = getOnboardingState().preferredTasks;
  const recommendedId = HONEST_FIRST_TASKS.has(
    getRecommendedFirstExperienceTaskId(preferred),
  )
    ? getRecommendedFirstExperienceTaskId(preferred)
    : "sns";
  const clarityTasks = useMemo(
    () => getFirstRunClarityTasks().filter((task) => HONEST_FIRST_TASKS.has(task.id)),
    [],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 50);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  useEffect(() => {
    dialogRef.current?.focus();
  }, [step]);

  const handleDefer = useCallback(() => {
    deferFirstExperience();
    onDefer();
  }, [onDefer]);

  const handleRun = useCallback(async () => {
    if (!selectedTask || running) return;
    setRunning(true);
    setStep("running");
    setProgressFilled(0);
    setEmployeeStep(null);

    void fetch("/api/growth/revenue-max", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "first_request_started",
        usecase: selectedTask === "sns" ? "sns" : "document",
      }),
    }).catch(() => undefined);

    try {
      const experienceResult = await runFirstExperienceTask(
        selectedTask,
        selectedTask === "custom" ? customText : undefined,
        {
          onProgress: (filled) => setProgressFilled(filled),
          onEmployeeStep: (next) => setEmployeeStep(next),
        },
      );
      completeFirstExperience(experienceResult);
      setResult(experienceResult);
      setStep("complete");
      void fetch("/api/growth/revenue-max", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "first_request_succeeded",
          summary: experienceResult.deliverable.title,
        }),
      })
        .then(async (response) => {
          if (!response.ok) return;
          const body = (await response.json()) as {
            snapshot?: { remainingAi?: { used: number; limit: number; remaining: number } | null };
          };
          if (body.snapshot?.remainingAi) setRemainingAi(body.snapshot.remainingAi);
        })
        .catch(() => undefined);
      void fetch("/api/growth/diagnosis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "first_value" }),
      }).catch(() => undefined);
    } catch {
      const message = "初回依頼の実行に失敗しました。同じ内容でもう一度試せます。";
      setFailMessage(message);
      setStep("failed");
      void fetch("/api/growth/revenue-max", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "first_request_failed",
          message,
        }),
      }).catch(() => undefined);
    } finally {
      setRunning(false);
    }
  }, [customText, running, selectedTask]);

  const timeSaved = useMemo(() => {
    if (!result) return null;
    const task = getFirstExperienceTask(result.taskId, customText);
    return buildTimeSavedBreakdown({
      measuredSec: result.durationSec,
      typicalManualMinutes: task.typicalManualMinutes,
    });
  }, [customText, result]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm sm:p-6">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="first-experience-title"
        tabIndex={-1}
        className={cn(
          "landing-glass max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] shadow-[var(--shadow-lg)] transition-[opacity,transform] duration-[var(--motion-modal)] ease-out outline-none",
          visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
        )}
      >
        {step === "select" && (
          <div className="px-6 py-8 sm:px-10 sm:py-10">
            <p className="text-xs font-medium tracking-wide text-accent">{ui.brand}</p>
            <h2
              id="first-experience-title"
              className="mt-2 text-xl font-semibold text-foreground sm:text-2xl"
            >
              {ui.firstExperience.selectTitle}
            </h2>
            <p className="mt-2 text-sm text-[var(--foreground-muted)]">
              {ui.firstExperience.selectHint}
            </p>

            <ul className="mt-5 grid gap-2 sm:grid-cols-2">
              {clarityTasks.map((task) => (
                <li key={task.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedTask(task.id)}
                    className={cn(
                      "touch-target flex w-full items-center gap-3 rounded-[var(--radius-xl)] border px-3 py-3 text-left transition-all focus:outline-none focus:ring-2 focus:ring-accent/25",
                      selectedTask === task.id
                        ? "border-accent bg-[var(--accent-muted)]"
                        : "border-[var(--border-subtle)] bg-[var(--card)]/70 hover:bg-[var(--background-subtle)]",
                    )}
                    aria-pressed={selectedTask === task.id}
                  >
                    <span className="text-xl" aria-hidden>
                      {task.icon}
                    </span>
                    <span className="text-sm font-medium text-foreground">
                      {task.label}
                      {task.id === recommendedId && (
                        <span className="ml-1.5 text-[10px] font-medium text-accent">
                          {ui.onboarding.recommended}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            <div className="mt-5">
              <label
                htmlFor="first-experience-custom"
                className="text-sm font-medium text-foreground"
              >
                {ui.firstExperience.customLabel}
              </label>
              <textarea
                id="first-experience-custom"
                rows={3}
                value={customText}
                onChange={(event) => {
                  setCustomText(event.target.value);
                  if (event.target.value.trim()) setSelectedTask("custom");
                }}
                placeholder={ui.firstExperience.customPlaceholder}
                className="mt-2 w-full rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--card-glass)] px-4 py-3 text-sm text-foreground placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-accent/25"
              />
            </div>

            <Button
              variant="primary"
              size="lg"
              className="mt-6 w-full"
              disabled={!selectedTask}
              onClick={() => void handleRun()}
            >
              {ui.firstExperience.delegate}
            </Button>
            <button
              type="button"
              onClick={handleDefer}
              className="mt-6 w-full text-center text-xs text-[var(--foreground-muted)]/80"
            >
              {ui.firstExperience.defer}
            </button>
          </div>
        )}

        {step === "running" && (
          <div className="px-6 py-8 sm:px-10 sm:py-10">
            <h2 className="text-lg font-semibold text-foreground">
              {ui.firstExperience.runningTitle}
            </h2>
            <p className="mt-2 text-sm text-[var(--foreground-muted)]">
              {selectedTask && getFirstExperienceTask(selectedTask, customText).assignment}
            </p>

            <div className="mt-8 space-y-6">
              <div>
                <p className="mb-2 text-xs font-medium text-[var(--foreground-muted)]">
                  {ui.firstExperience.progressHeading}
                </p>
                <ProgressBlocks filled={progressFilled} total={8} />
              </div>

              {employeeStep && (
                <div className="animate-fade-up rounded-[var(--radius-xl)] border border-accent/20 bg-accent/[0.04] px-4 py-4">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl" aria-hidden>
                      {employeeStep.icon}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {employeeStep.role}
                      </p>
                      <p className="text-xs text-accent">{employeeStep.status}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {step === "failed" && (
          <div className="px-6 py-8 sm:px-10 sm:py-10">
            <h2 className="text-xl font-semibold text-foreground">初回の仕事が完了しませんでした</h2>
            <p className="mt-3 text-sm text-[var(--foreground-muted)]">
              {failMessage ?? "原因を特定できませんでした。"}
            </p>
            <p className="mt-2 text-sm text-[var(--foreground-muted)]">
              同じ依頼をもう一度試すか、内容を変えてやり直せます。ホームへ戻ると続きが分からなくなるので、ここで再試行してください。
            </p>
            <Button
              variant="primary"
              size="lg"
              className="mt-6 w-full"
              onClick={() => void handleRun()}
            >
              もう一度試す
            </Button>
            <Button
              variant="secondary"
              size="lg"
              className="mt-3 w-full"
              onClick={() => setStep("select")}
            >
              内容を変える
            </Button>
            <Link href="/contact" className="mt-4 block text-center text-sm underline">
              サポートへ連絡
            </Link>
          </div>
        )}

        {step === "complete" && result && (
          <div className="px-6 py-8 sm:px-10 sm:py-10">
            <h2 className="text-xl font-semibold text-foreground">
              {ui.firstExperience.completeTitle}
            </h2>

            {timeSaved?.savedMinutes != null && timeSaved.savedMinutes > 0 ? (
              <div className="mt-4 rounded-[var(--radius-xl)] border border-accent/25 bg-[var(--accent-muted)] px-4 py-4">
                <p className="text-base font-semibold text-foreground">
                  {ui.firstExperience.savedWorkValue(
                    formatSavedAmount(timeSaved.savedMinutes),
                  )}
                </p>
                <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                  {ui.firstExperience.savedWorkHint}
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-[var(--foreground-muted)]">
                {ui.firstExperience.noSavedEstimate}
              </p>
            )}

            <p className="mt-4 text-sm leading-relaxed text-foreground">
              {ui.firstExperience.firstWinMessage}
            </p>

            <div className="landing-glass mt-6 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] p-4">
              <p className="text-xs text-[var(--foreground-muted)]">
                {ui.firstExperience.deliverableLabel}
              </p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {result.deliverable.title}
              </p>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[var(--foreground-muted)]">
                {result.deliverable.preview}
              </p>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-[var(--radius-lg)] bg-[var(--card)]/60 px-3 py-3">
                <dt className="text-xs text-[var(--foreground-muted)]">
                  {ui.firstExperience.measuredDurationLabel}
                </dt>
                <dd className="mt-1 font-semibold text-foreground">
                  {timeSaved ? formatMeasuredDuration(timeSaved.measuredSec) : "—"}
                </dd>
              </div>
              <div className="rounded-[var(--radius-lg)] bg-[var(--card)]/60 px-3 py-3">
                <dt className="text-xs text-[var(--foreground-muted)]">
                  {ui.firstExperience.typicalManualLabel}
                </dt>
                <dd className="mt-1 font-semibold text-foreground">
                  {timeSaved?.typicalManualMinutes != null
                    ? `${timeSaved.typicalManualMinutes}分`
                    : "—"}
                </dd>
              </div>
              <div className="col-span-2 rounded-[var(--radius-lg)] bg-[var(--card)]/60 px-3 py-3">
                <dt className="text-xs text-[var(--foreground-muted)]">
                  {ui.firstExperience.saveLabel}
                </dt>
                <dd className="mt-1 font-semibold text-foreground">{result.saveLocation}</dd>
              </div>
            </dl>

            <p className="mt-4 text-sm text-foreground">
              今回できたこと: {result.deliverable.title}
              {result.usedRealOrchestration ? "" : "（見本の下書きです。本番の依頼とは分けて表示しています）"}
            </p>
            <p className="mt-1 text-sm text-[var(--foreground-muted)]">
              次に自動化できること: 同じ依頼を自動化に残す、または X 連携後に投稿を任せる
            </p>
            {remainingAi ? (
              <p className="mt-1 text-sm text-[var(--foreground-muted)]">
                無料プランの今月のAI利用: 残り {remainingAi.remaining} / {remainingAi.limit}
                （使用 {remainingAi.used}）
              </p>
            ) : (
              <p className="mt-1 text-sm text-[var(--foreground-muted)]">
                無料プランの残り利用量: 未取得
              </p>
            )}

            <Link
              href={result.nextIntegration.href}
              className="mt-5 flex items-center justify-between rounded-[var(--radius-xl)] border border-accent/25 bg-[var(--accent-muted)] px-4 py-4 transition-colors hover:bg-accent/10"
            >
              <div>
                <p className="text-xs text-[var(--foreground-muted)]">
                  {ui.firstExperience.nextRecommendLabel}
                </p>
                <p className="text-sm font-medium text-foreground">
                  {result.nextIntegration.label}
                </p>
              </div>
              <span className="text-sm text-accent">→</span>
            </Link>

            <ReferralInvite />

            <Button variant="primary" size="lg" className="mt-6 w-full" onClick={onComplete}>
              {ui.firstExperience.goHome}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
