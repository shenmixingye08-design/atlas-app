"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  completeOnboarding,
  deferOnboarding,
  ONBOARDING_TASK_IDS,
  seedProfileFromOnboarding,
  getOnboardingTask,
} from "@/lib/onboarding";
import type { OnboardingEntryMode, OnboardingTaskId } from "@/lib/user-profile/types";
import { cn } from "@/lib/design-system/cn";
import { ui } from "@/lib/i18n";

type WizardStep = "welcome" | "guide-1" | "guide-2" | "guide-3" | "purpose";

type WelcomeWizardProps = {
  onComplete: () => void;
};

const GUIDE_STEPS: WizardStep[] = ["guide-1", "guide-2", "guide-3"];

export function WelcomeWizard({ onComplete }: WelcomeWizardProps) {
  const [step, setStep] = useState<WizardStep>("welcome");
  const [entryMode, setEntryMode] = useState<OnboardingEntryMode>("guide");
  const [selectedTasks, setSelectedTasks] = useState<OnboardingTaskId[]>([]);
  const [visible, setVisible] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

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

  const toggleTask = useCallback((taskId: OnboardingTaskId) => {
    setSelectedTasks((prev) => {
      if (taskId === "undecided") {
        return prev.includes("undecided") ? [] : ["undecided"];
      }
      const withoutUndecided = prev.filter((id) => id !== "undecided");
      return withoutUndecided.includes(taskId)
        ? withoutUndecided.filter((id) => id !== taskId)
        : [...withoutUndecided, taskId];
    });
  }, []);

  const finishOnboarding = useCallback(
    (tasks: OnboardingTaskId[], mode: OnboardingEntryMode) => {
      const finalTasks = tasks.length > 0 ? tasks : (["undecided"] as OnboardingTaskId[]);
      seedProfileFromOnboarding(finalTasks);
      completeOnboarding({ preferredTasks: finalTasks, entryMode: mode });
      onComplete();
    },
    [onComplete],
  );

  const handleStartGuide = () => {
    setEntryMode("guide");
    setStep("guide-1");
  };

  const handleSkipToPurpose = () => {
    setEntryMode("skip");
    setStep("purpose");
  };

  const handleLater = () => {
    deferOnboarding();
    onComplete();
  };

  const handleGuideNext = () => {
    const index = GUIDE_STEPS.indexOf(step);
    if (index < GUIDE_STEPS.length - 1) {
      setStep(GUIDE_STEPS[index + 1]!);
      return;
    }
    setStep("purpose");
  };

  const handlePurposeSubmit = () => {
    finishOnboarding(selectedTasks, entryMode);
  };

  const guideIndex = GUIDE_STEPS.indexOf(step);
  const isGuideStep = guideIndex >= 0;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm sm:p-6"
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-wizard-title"
        tabIndex={-1}
        className={cn(
          "landing-glass w-full max-w-lg rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] shadow-[var(--shadow-lg)] transition-all duration-500 ease-out outline-none",
          visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
        )}
      >
        {step === "welcome" && (
          <div className="px-6 py-8 sm:px-10 sm:py-10">
            <p className="text-center text-xs font-medium text-accent">
              {ui.onboarding.badge}
            </p>
            <h2
              id="welcome-wizard-title"
              className="mt-3 text-center text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
            >
              {ui.onboarding.welcomeTitle}
            </h2>
            <p className="mt-3 text-center text-sm text-[var(--foreground-muted)] sm:text-base">
              {ui.onboarding.welcomeSubtitle}
            </p>

            <ul className="mt-8 space-y-3">
              <li className="rounded-[var(--radius-xl)] border border-accent/25 bg-accent/[0.04] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {ui.onboarding.optionGuideTitle}
                      <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-white">
                        {ui.onboarding.recommended}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                      {ui.onboarding.optionGuideDesc}
                    </p>
                  </div>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  className="mt-4 w-full"
                  onClick={handleStartGuide}
                >
                  {ui.onboarding.startGuide}
                </Button>
              </li>

              <li className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-white/70 p-4">
                <p className="text-sm font-semibold text-foreground">
                  {ui.onboarding.optionSkipTitle}
                </p>
                <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                  {ui.onboarding.optionSkipDesc}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-4 w-full"
                  onClick={handleSkipToPurpose}
                >
                  {ui.onboarding.skipAndStart}
                </Button>
              </li>

              <li className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-white/50 p-4">
                <p className="text-sm font-semibold text-foreground">
                  {ui.onboarding.optionLaterTitle}
                </p>
                <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                  {ui.onboarding.optionLaterDesc}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-4 w-full"
                  onClick={handleLater}
                >
                  {ui.onboarding.later}
                </Button>
              </li>
            </ul>
          </div>
        )}

        {isGuideStep && (
          <div className="px-6 py-8 sm:px-10 sm:py-10">
            <p className="text-xs font-medium text-accent">
              {ui.onboarding.guideProgress(guideIndex + 1, GUIDE_STEPS.length)}
            </p>
            <h2 className="mt-3 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {ui.onboarding.guideSteps[guideIndex]?.title}
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-[var(--foreground-muted)]">
              {ui.onboarding.guideSteps[guideIndex]?.body}
            </p>
            <div className="mt-8 flex gap-3">
              {guideIndex > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex-1"
                  onClick={() => setStep(GUIDE_STEPS[guideIndex - 1]!)}
                >
                  {ui.onboarding.back}
                </Button>
              )}
              <Button
                variant="primary"
                size="sm"
                className="flex-1"
                onClick={handleGuideNext}
              >
                {guideIndex < GUIDE_STEPS.length - 1
                  ? ui.onboarding.next
                  : ui.onboarding.toPurpose}
              </Button>
            </div>
          </div>
        )}

        {step === "purpose" && (
          <div className="px-6 py-8 sm:px-10 sm:py-10">
            <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {ui.onboarding.purposeTitle}
            </h2>
            <p className="mt-2 text-sm text-[var(--foreground-muted)]">
              {ui.onboarding.purposeHint}
            </p>

            <ul className="mt-6 grid gap-2 sm:grid-cols-2">
              {ONBOARDING_TASK_IDS.map((taskId) => {
                const task = getOnboardingTask(taskId);
                const selected = selectedTasks.includes(taskId);
                return (
                  <li key={taskId}>
                    <button
                      type="button"
                      onClick={() => toggleTask(taskId)}
                      className={cn(
                        "touch-target flex w-full items-center gap-3 rounded-[var(--radius-xl)] border px-3 py-3 text-left transition-all focus:outline-none focus:ring-2 focus:ring-accent/25 sm:px-4",
                        selected
                          ? "border-accent bg-[var(--accent-muted)] shadow-[var(--shadow-sm)]"
                          : "border-[var(--border-subtle)] bg-white/70 hover:bg-[var(--background-subtle)]",
                      )}
                      aria-pressed={selected}
                    >
                      <span className="text-xl" aria-hidden>
                        {task.icon}
                      </span>
                      <span className="text-sm font-medium text-foreground">
                        {task.label}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <Button
              variant="primary"
              size="lg"
              className="mt-8 w-full"
              onClick={handlePurposeSubmit}
            >
              {ui.onboarding.finish}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
