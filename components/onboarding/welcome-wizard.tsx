"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { completeOnboarding } from "@/lib/onboarding";
import { cn } from "@/lib/design-system/cn";
import { ui } from "@/lib/i18n";

type WelcomeWizardProps = {
  onComplete: () => void;
};

/**
 * Clarity first screen — one message, then pick a job.
 * Multi-step product tour removed to reduce drop-off before first completion.
 */
export function WelcomeWizard({ onComplete }: WelcomeWizardProps) {
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
  }, []);

  const finish = useCallback(
    (mode: "guide" | "skip") => {
      completeOnboarding({
        preferredTasks: [],
        entryMode: mode,
      });
      // Do NOT defer first experience — first completion is the product.
      onComplete();
    },
    [onComplete],
  );

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
          <p className="text-center text-xs font-medium tracking-wide text-accent">
            {ui.brand}
          </p>

          <h2
            id="welcome-wizard-title"
            className="mt-3 text-center text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
          >
            {ui.onboarding.clarityHeadline}
          </h2>

          <p className="mx-auto mt-4 max-w-md whitespace-pre-line text-center text-sm leading-relaxed text-[var(--foreground-muted)] sm:text-base">
            {ui.onboarding.clarityBody}
          </p>

          <ol className="mx-auto mt-8 flex max-w-sm items-center justify-between gap-2">
            {ui.onboarding.claritySteps.map((step, index) => (
              <li key={step} className="flex flex-1 flex-col items-center gap-2 text-center">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-sm font-semibold text-accent">
                  {index + 1}
                </span>
                <span className="text-xs font-medium text-foreground sm:text-sm">
                  {step}
                </span>
              </li>
            ))}
          </ol>

          <div className="mt-8">
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={() => finish("guide")}
            >
              {ui.onboarding.clarityCta}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
