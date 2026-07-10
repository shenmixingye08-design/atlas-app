"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { deferFirstExperience } from "@/lib/first-experience";
import { completeOnboarding } from "@/lib/onboarding";
import { cn } from "@/lib/design-system/cn";
import { ui } from "@/lib/i18n";

type WelcomeWizardProps = {
  onComplete: () => void;
};

const TOTAL_STEPS = 5;

function StepIllustration({ step }: { step: number }) {
  const common = "h-14 w-14 text-accent sm:h-16 sm:w-16";
  switch (step) {
    case 0:
      return (
        <svg className={common} viewBox="0 0 64 64" fill="none" aria-hidden>
          <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="1.5" opacity="0.25" />
          <path
            d="M22 34c2.5 5 7 8 10 8s7.5-3 10-8"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
          <circle cx="24" cy="26" r="2" fill="currentColor" />
          <circle cx="40" cy="26" r="2" fill="currentColor" />
        </svg>
      );
    case 1:
      return (
        <svg className={common} viewBox="0 0 64 64" fill="none" aria-hidden>
          <rect
            x="14"
            y="12"
            width="36"
            height="40"
            rx="6"
            stroke="currentColor"
            strokeWidth="1.5"
            opacity="0.35"
          />
          <path
            d="M22 24h20M22 32h16M22 40h12"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      );
    case 2:
      return (
        <svg className={common} viewBox="0 0 64 64" fill="none" aria-hidden>
          <path
            d="M18 40c6-14 22-14 28 0"
            stroke="currentColor"
            strokeWidth="1.5"
            opacity="0.3"
            strokeLinecap="round"
          />
          <circle cx="32" cy="28" r="10" stroke="currentColor" strokeWidth="1.75" />
          <path
            d="M28 28l3 3 6-6"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 3:
      return (
        <svg className={common} viewBox="0 0 64 64" fill="none" aria-hidden>
          <rect
            x="16"
            y="14"
            width="32"
            height="36"
            rx="4"
            stroke="currentColor"
            strokeWidth="1.5"
            opacity="0.35"
          />
          <path
            d="M24 12v4M40 12v4M16 24h32"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <circle cx="26" cy="34" r="2" fill="currentColor" />
          <circle cx="32" cy="34" r="2" fill="currentColor" />
          <circle cx="38" cy="34" r="2" fill="currentColor" opacity="0.4" />
        </svg>
      );
    default:
      return (
        <svg className={common} viewBox="0 0 64 64" fill="none" aria-hidden>
          <path
            d="M18 42l10-22 8 14 4-8 6 16"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="46" cy="20" r="4" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
  }
}

export function WelcomeWizard({ onComplete }: WelcomeWizardProps) {
  const [stepIndex, setStepIndex] = useState(0);
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
  }, [stepIndex]);

  const finish = useCallback(
    (mode: "guide" | "skip") => {
      completeOnboarding({
        preferredTasks: [],
        entryMode: mode,
      });
      // ダミー業務・架空体験は自動起動しない
      deferFirstExperience();
      onComplete();
    },
    [onComplete],
  );

  const step = ui.onboarding.steps[stepIndex];
  const isLast = stepIndex === TOTAL_STEPS - 1;
  const examples =
    step && "examples" in step && Array.isArray(step.examples) ? step.examples : [];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/35 p-4 backdrop-blur-md sm:p-6"
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-wizard-title"
        tabIndex={-1}
        className={cn(
          "relative w-full max-w-xl overflow-hidden rounded-[28px] border border-[var(--border-subtle)] bg-[var(--card)] shadow-[var(--shadow-lg)] outline-none transition-all duration-500 ease-out",
          visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
        )}
      >
        <button
          type="button"
          onClick={() => finish("skip")}
          className="absolute right-4 top-4 z-10 rounded-full px-3 py-1.5 text-sm text-[var(--foreground-muted)] transition-colors hover:bg-[var(--background-subtle)] hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent/25"
        >
          {ui.onboarding.skip}
        </button>

        <div className="px-6 pb-8 pt-12 sm:px-12 sm:pb-10 sm:pt-14">
          <div className="flex justify-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[var(--background-subtle)] sm:h-28 sm:w-28">
              <StepIllustration step={stepIndex} />
            </div>
          </div>

          <p className="mt-6 text-center text-xs font-medium tracking-wide text-accent">
            {ui.onboarding.stepLabel(stepIndex + 1, TOTAL_STEPS)}
          </p>

          <h2
            id="welcome-wizard-title"
            className="mt-3 text-center text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
          >
            {step?.title}
          </h2>

          <p className="mx-auto mt-4 max-w-md whitespace-pre-line text-center text-sm leading-relaxed text-[var(--foreground-muted)] sm:text-base">
            {step?.body}
          </p>

          {examples.length > 0 && (
            <ul className="mx-auto mt-6 flex max-w-sm flex-wrap justify-center gap-2">
              {examples.map((example) => (
                <li
                  key={example}
                  className="rounded-full border border-[var(--border-subtle)] bg-[var(--background-subtle)] px-3 py-1.5 text-xs text-[var(--foreground-muted)] sm:text-sm"
                >
                  {example}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-8 flex items-center justify-center gap-2" aria-hidden>
            {Array.from({ length: TOTAL_STEPS }).map((_, index) => (
              <span
                key={index}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  index === stepIndex
                    ? "w-6 bg-accent"
                    : "w-1.5 bg-[var(--border-subtle)]",
                )}
              />
            ))}
          </div>

          <div className="mt-8 flex gap-3">
            {stepIndex > 0 && (
              <Button
                variant="secondary"
                size="lg"
                className="flex-1"
                onClick={() => setStepIndex((prev) => Math.max(0, prev - 1))}
              >
                {ui.onboarding.back}
              </Button>
            )}
            {isLast ? (
              <Button
                variant="primary"
                size="lg"
                className="flex-1"
                onClick={() => finish("guide")}
              >
                {ui.onboarding.finish}
              </Button>
            ) : (
              <Button
                variant="primary"
                size="lg"
                className="flex-1"
                onClick={() => setStepIndex((prev) => Math.min(TOTAL_STEPS - 1, prev + 1))}
              >
                {ui.onboarding.next}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
