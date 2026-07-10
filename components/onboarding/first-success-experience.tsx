"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { getOnboardingState } from "@/lib/onboarding";
import {
  FIRST_EXPERIENCE_TASKS,
  completeFirstExperience,
  deferFirstExperience,
  getFirstExperienceTask,
  getRecommendedFirstExperienceTaskId,
  runFirstExperienceTask,
  type FirstExperienceEmployeeStep,
  type FirstExperienceResult,
  type FirstExperienceTaskId,
} from "@/lib/first-experience";
import { cn } from "@/lib/design-system/cn";
import { ui } from "@/lib/i18n";

type ExperienceStep = "intro" | "select" | "running" | "complete";

type FirstSuccessExperienceProps = {
  onComplete: () => void;
  onDefer: () => void;
};

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
  const [step, setStep] = useState<ExperienceStep>("intro");
  const [visible, setVisible] = useState(false);
  const [selectedTask, setSelectedTask] = useState<FirstExperienceTaskId | null>(null);
  const [customText, setCustomText] = useState("");
  const [progressFilled, setProgressFilled] = useState(0);
  const [employeeStep, setEmployeeStep] = useState<FirstExperienceEmployeeStep | null>(null);
  const [result, setResult] = useState<FirstExperienceResult | null>(null);
  const [running, setRunning] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const preferred = getOnboardingState().preferredTasks;
  const recommendedId = getRecommendedFirstExperienceTaskId(preferred);

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

    try {
      const experienceResult = await runFirstExperienceTask(
        selectedTask,
        selectedTask === "custom" ? customText : undefined,
        {
          onProgress: (filled) => setProgressFilled(filled),
          onEmployeeStep: (step) => setEmployeeStep(step),
        },
      );
      completeFirstExperience(experienceResult);
      setResult(experienceResult);
      setStep("complete");
    } catch {
      const fallback = getFirstExperienceTask(selectedTask, customText);
      const experienceResult = {
        taskId: selectedTask,
        jobCategory: fallback.jobCategory,
        durationSec: 45,
        deliverable: fallback.deliverable,
        leadEmployee: fallback.leadEmployee,
        saveLocation: fallback.saveLocation,
        nextIntegration: fallback.nextIntegration,
        usedRealOrchestration: false,
      };
      completeFirstExperience(experienceResult);
      setResult(experienceResult);
      setStep("complete");
    } finally {
      setRunning(false);
    }
  }, [customText, running, selectedTask]);

  const handleGoHome = () => {
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm sm:p-6">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="first-experience-title"
        tabIndex={-1}
        className={cn(
          "landing-glass max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] shadow-[var(--shadow-lg)] transition-all duration-500 ease-out outline-none",
          visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
        )}
      >
        {step === "intro" && (
          <div className="px-6 py-8 text-center sm:px-10 sm:py-10">
            <p className="text-4xl" aria-hidden>
              🎉
            </p>
            <h2
              id="first-experience-title"
              className="mt-4 text-2xl font-semibold tracking-tight text-foreground"
            >
              {ui.firstExperience.introTitle}
            </h2>
            <p className="mt-3 text-sm text-[var(--foreground-muted)] sm:text-base">
              {ui.firstExperience.introSubtitle}
            </p>
            <Button
              variant="primary"
              size="lg"
              className="mt-8 w-full"
              onClick={() => setStep("select")}
            >
              {ui.firstExperience.startSelect}
            </Button>
            <button
              type="button"
              onClick={handleDefer}
              className="mt-4 text-sm text-[var(--foreground-muted)] underline-offset-2 hover:text-foreground hover:underline"
            >
              {ui.firstExperience.defer}
            </button>
          </div>
        )}

        {step === "select" && (
          <div className="px-6 py-8 sm:px-10 sm:py-10">
            <h2 className="text-xl font-semibold text-foreground">
              {ui.firstExperience.selectTitle}
            </h2>
            <ul className="mt-5 grid gap-2 sm:grid-cols-2">
              {FIRST_EXPERIENCE_TASKS.map((task) => (
                <li key={task.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedTask(task.id)}
                    className={cn(
                      "touch-target flex w-full items-center gap-3 rounded-[var(--radius-xl)] border px-3 py-3 text-left transition-all focus:outline-none focus:ring-2 focus:ring-accent/25",
                      selectedTask === task.id
                        ? "border-accent bg-[var(--accent-muted)]"
                        : "border-[var(--border-subtle)] bg-white/70 hover:bg-[var(--background-subtle)]",
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
                className="mt-2 w-full rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-white/80 px-4 py-3 text-sm text-foreground placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-accent/25"
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
              className="mt-4 w-full text-center text-sm text-[var(--foreground-muted)] hover:text-foreground"
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

        {step === "complete" && result && (
          <div className="px-6 py-8 sm:px-10 sm:py-10">
            <h2 className="text-xl font-semibold text-foreground">
              {ui.firstExperience.completeTitle}
            </h2>

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
              <div className="rounded-[var(--radius-lg)] bg-white/60 px-3 py-3">
                <dt className="text-xs text-[var(--foreground-muted)]">
                  {ui.firstExperience.durationLabel}
                </dt>
                <dd className="mt-1 font-semibold text-foreground">
                  {ui.firstExperience.durationValue(result.durationSec)}
                </dd>
              </div>
              <div className="rounded-[var(--radius-lg)] bg-white/60 px-3 py-3">
                <dt className="text-xs text-[var(--foreground-muted)]">
                  {ui.firstExperience.employeeLabel}
                </dt>
                <dd className="mt-1 font-semibold text-foreground">{result.leadEmployee}</dd>
              </div>
              <div className="col-span-2 rounded-[var(--radius-lg)] bg-white/60 px-3 py-3">
                <dt className="text-xs text-[var(--foreground-muted)]">
                  {ui.firstExperience.saveLabel}
                </dt>
                <dd className="mt-1 font-semibold text-foreground">{result.saveLocation}</dd>
              </div>
            </dl>

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

            <Button variant="primary" size="lg" className="mt-6 w-full" onClick={handleGoHome}>
              {ui.firstExperience.goHome}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
