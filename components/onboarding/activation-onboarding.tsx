"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  fetchActivationView,
  patchActivationProgress,
  postActivationClientEvent,
  type ActivationViewResponse,
} from "@/lib/activation/client";
import {
  buildQuickStartHref,
  getActivationGoal,
} from "@/lib/activation/goals";
import type { ActivationGoalId } from "@/lib/activation/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/design-system/cn";

type ActivationOnboardingProps = {
  onComplete: () => void;
  onSkip: () => void;
};

export function ActivationOnboarding({
  onComplete,
  onSkip,
}: ActivationOnboardingProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<ActivationViewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [goalId, setGoalId] = useState<ActivationGoalId | null>(null);
  const [step, setStep] = useState<"goal" | "setup">("goal");
  const [theme, setTheme] = useState("");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState("短く丁寧に");
  const [count, setCount] = useState("3");
  const [frequency, setFrequency] = useState("毎週");
  const [hour, setHour] = useState("10");

  useEffect(() => {
    void fetchActivationView()
      .then((next) => {
        setView(next);
        const selected = next.progress.selectedGoal ?? next.recommendedGoal;
        setGoalId(selected);
        setTheme(next.progress.draftInputs.theme ?? "");
        setAudience(next.progress.draftInputs.audience ?? "");
        setTone(next.progress.draftInputs.tone ?? "短く丁寧に");
        setCount(next.progress.draftInputs.count ?? "3");
        setFrequency(next.progress.draftInputs.frequency ?? "毎週");
        setHour(next.progress.draftInputs.hour ?? "10");
        if (next.progress.selectedGoal) setStep("setup");
        void postActivationClientEvent({
          event: "onboarding_started",
          sourcePage: "/projects",
        });
      })
      .catch(() => setError("案内を読み込めませんでした。"));
  }, []);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const goal = useMemo(
    () => (goalId ? getActivationGoal(goalId) : null),
    [goalId],
  );

  const start = async () => {
    if (!goal || !goalId) return;
    const draftInputs = { theme, audience, tone, count, frequency, hour };
    const assignment = goal.assignmentTemplate(draftInputs);
    await patchActivationProgress({
      selectedGoal: goalId,
      draftInputs,
      currentStep: "generate",
      phase: "in_progress",
    });
    await postActivationClientEvent({
      event: "quick_start_selected",
      selectedGoal: goalId,
      sourcePage: "/projects",
    });
    onComplete();
    router.push(buildQuickStartHref(goal, assignment));
  };

  const skip = async () => {
    await patchActivationProgress({ phase: "skipped" });
    await postActivationClientEvent({
      event: "onboarding_skipped",
      sourcePage: "/projects",
    });
    onSkip();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/35 p-4 backdrop-blur-md sm:items-center"
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="activation-onboarding-title"
        tabIndex={-1}
        className="w-full max-w-xl rounded-[28px] border border-[var(--border-subtle)] bg-[var(--card)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-lg)] outline-none motion-reduce:transition-none sm:p-8"
      >
        <p className="text-caption text-accent">MINERVOT</p>
        <h2
          id="activation-onboarding-title"
          className="mt-2 text-xl font-semibold text-foreground sm:text-2xl"
        >
          何を楽にしたいですか？
        </h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          最初は1つだけで十分です。あとから変えられます。
        </p>

        {error ? (
          <p className="mt-4 text-sm text-[var(--error)]" role="alert">
            {error}
          </p>
        ) : null}

        {step === "goal" ? (
          <ul className="mt-5 space-y-2" role="listbox" aria-label="目的">
            {(view?.goals ?? []).map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={goalId === item.id}
                  onClick={() => setGoalId(item.id)}
                  className={cn(
                    "flex min-h-[44px] w-full flex-col items-start rounded-[var(--radius-xl)] border px-4 py-3 text-left focus-ring",
                    goalId === item.id
                      ? "border-accent bg-accent/10"
                      : "border-[var(--border-subtle)] bg-[var(--surface-muted)]",
                  )}
                >
                  <span className="text-sm font-semibold text-foreground">
                    {item.title}
                    {item.recommended ? "（おすすめ）" : ""}
                  </span>
                  <span className="mt-1 text-caption text-[var(--text-secondary)]">
                    {item.summary}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : goal ? (
          <div className="mt-5 space-y-3">
            <p className="text-sm text-[var(--text-secondary)]">{goal.whatHappens}</p>
            {goal.id === "x_draft" || goal.id === "x_autopost" ? (
              <>
                <Input label="テーマ" value={theme} onChange={(e) => setTheme(e.target.value)} />
                {goal.id === "x_draft" ? (
                  <>
                    <Input
                      label="読者"
                      value={audience}
                      onChange={(e) => setAudience(e.target.value)}
                    />
                    <Input label="文体" value={tone} onChange={(e) => setTone(e.target.value)} />
                    <Input label="作成数" value={count} onChange={(e) => setCount(e.target.value)} />
                  </>
                ) : (
                  <>
                    <Input
                      label="頻度"
                      value={frequency}
                      onChange={(e) => setFrequency(e.target.value)}
                    />
                    <Input label="時刻" value={hour} onChange={(e) => setHour(e.target.value)} />
                  </>
                )}
              </>
            ) : null}
            <ol className="space-y-1 text-caption text-[var(--text-secondary)]">
              {goal.steps.map((item, index) => (
                <li key={item.id}>
                  {index + 1}. {item.label} — {item.hint}
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-2 min-[390px]:flex-row">
          {step === "goal" ? (
            <Button
              className="w-full min-[390px]:w-auto"
              disabled={!goalId}
              onClick={() => setStep("setup")}
            >
              この目的で進める
            </Button>
          ) : (
            <>
              <Button className="w-full min-[390px]:w-auto" onClick={() => void start()}>
                依頼を始める
              </Button>
              <Button
                variant="secondary"
                className="w-full min-[390px]:w-auto"
                onClick={() => setStep("goal")}
              >
                戻る
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            className="w-full min-[390px]:w-auto"
            onClick={() => void skip()}
          >
            後で進める
          </Button>
        </div>
      </div>
    </div>
  );
}
