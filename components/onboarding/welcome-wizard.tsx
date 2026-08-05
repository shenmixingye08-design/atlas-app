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
 * One-screen welcome → first job. Skip removed (conversion killer).
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

  const finish = useCallback(() => {
    completeOnboarding({
      preferredTasks: [],
      entryMode: "guide",
    });
    onComplete();
  }, [onComplete]);

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
          "relative w-full max-w-xl overflow-hidden rounded-[28px] border border-[var(--border-subtle)] bg-[var(--card)] shadow-[var(--shadow-lg)] outline-none",
          visible ? "opacity-100" : "opacity-0",
        )}
      >
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
              onClick={finish}
            >
              {ui.onboarding.clarityCta}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
