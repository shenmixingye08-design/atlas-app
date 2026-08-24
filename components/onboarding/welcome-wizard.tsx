"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { completeOnboarding } from "@/lib/onboarding";
import {
  PAIN_CHOICES,
  usecasesForPain,
  type FirstUsecaseId,
  type PainChoice,
} from "@/lib/growth/revenue-max/usecases";
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
  const [pain, setPain] = useState<PainChoice | null>(null);
  const [usecase, setUsecase] = useState<FirstUsecaseId | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 50);
    void fetch("/api/growth/revenue-max", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "onboarding_started" }),
    }).catch(() => undefined);
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
    if (!pain || !usecase) return;
    completeOnboarding({
      preferredTasks:
        usecase === "sns" ? ["sns"] : usecase === "document" ? ["sales_material"] : [],
      entryMode: "guide",
    });
    void fetch("/api/growth/revenue-max", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "first_usecase_selected",
        pain,
        usecase,
      }),
    }).catch(() => undefined);
    onComplete();
  }, [onComplete, pain, usecase]);

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
          "relative w-full max-w-xl overflow-hidden rounded-[28px] border border-[var(--border-subtle)] bg-[var(--card)] shadow-[var(--shadow-lg)] outline-none transition-[opacity,transform] duration-[var(--motion-modal)] ease-out",
          visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
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

          <fieldset className="mt-8 space-y-2">
            <legend className="text-sm font-medium text-foreground">
              何を減らしたいですか（1問）
            </legend>
            {PAIN_CHOICES.map((choice) => (
              <label key={choice.id} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="pain"
                  checked={pain === choice.id}
                  onChange={() => {
                    setPain(choice.id);
                    const next = usecasesForPain(choice.id)[0];
                    if (next) setUsecase(next.id);
                  }}
                />
                {choice.label}
              </label>
            ))}
          </fieldset>

          {pain ? (
            <fieldset className="mt-6 space-y-2">
              <legend className="text-sm font-medium text-foreground">
                最初に試す仕事（2問目）
              </legend>
              {usecasesForPain(pain).map((choice) => (
                <label key={choice.id} className="flex flex-col gap-0.5 text-sm">
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="usecase"
                      checked={usecase === choice.id}
                      onChange={() => setUsecase(choice.id)}
                    />
                    {choice.label}
                  </span>
                  <span className="pl-6 text-xs text-[var(--foreground-muted)]">
                    {choice.note}
                    {choice.sampleOnly ? " · 見本で試せます" : ""}
                  </span>
                </label>
              ))}
            </fieldset>
          ) : null}

          <div className="mt-8">
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              disabled={!pain || !usecase}
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
