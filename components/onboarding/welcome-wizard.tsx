"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { trackActivationEvent } from "@/lib/activation";
import { ONBOARDING_TASKS } from "@/lib/onboarding";
import {
  RETENTION_INTEGRATIONS,
  RETENTION_ROLES,
  completeRetentionWizard,
  type RetentionIntegrationId,
  type RetentionRoleId,
} from "@/lib/retention";
import type { OnboardingTaskId } from "@/lib/user-profile/types";
import { cn } from "@/lib/design-system/cn";
import { ui } from "@/lib/i18n";

type WelcomeWizardProps = {
  onComplete: (options?: { startActivation?: boolean; activationHref?: string }) => void;
};

type WizardStep = "welcome" | "work" | "automations" | "integrations" | "ready";

const STEPS: WizardStep[] = [
  "welcome",
  "work",
  "automations",
  "integrations",
  "ready",
];

const TASK_CHOICES = ONBOARDING_TASKS.filter((task) => task.id !== "undecided");

export function WelcomeWizard({ onComplete }: WelcomeWizardProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [workDescription, setWorkDescription] = useState("");
  const [company, setCompany] = useState("");
  const [roleId, setRoleId] = useState<RetentionRoleId>("sales");
  const [preferredTasks, setPreferredTasks] = useState<OnboardingTaskId[]>([
    "sales_material",
  ]);
  const [integrations, setIntegrations] = useState<RetentionIntegrationId[]>([]);
  const dialogRef = useRef<HTMLDivElement>(null);

  const step = STEPS[stepIndex] ?? "welcome";
  const isLast = stepIndex === STEPS.length - 1;

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

  const roleMeta = useMemo(
    () => RETENTION_ROLES.find((role) => role.id === roleId) ?? RETENTION_ROLES[0]!,
    [roleId],
  );

  const finish = useCallback(
    (mode: "guide" | "skip") => {
      const result = completeRetentionWizard({
        workDescription:
          workDescription.trim() ||
          (mode === "skip" ? "最初の仕事" : roleMeta.hint),
        company,
        roleId,
        preferredTasks:
          preferredTasks.length > 0 ? preferredTasks : roleMeta.defaultTasks,
        integrations,
        entryMode: mode,
      });
      trackActivationEvent("signup_completed", {
        entryMode: mode,
        templateId: "weekly_sales_report_word",
        roleId,
      });
      // Never end at settings-only — always start Quick Win.
      onComplete({
        startActivation: true,
        activationHref: result.quickWinHref,
      });
    },
    [
      company,
      integrations,
      onComplete,
      preferredTasks,
      roleId,
      roleMeta.defaultTasks,
      roleMeta.hint,
      workDescription,
    ],
  );

  const toggleTask = (id: OnboardingTaskId) => {
    setPreferredTasks((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const toggleIntegration = (id: RetentionIntegrationId) => {
    setIntegrations((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const selectRole = (next: RetentionRoleId) => {
    setRoleId(next);
    const defaults = RETENTION_ROLES.find((role) => role.id === next)?.defaultTasks;
    if (defaults) setPreferredTasks(defaults);
  };

  const canContinue =
    step !== "work" ||
    workDescription.trim().length > 0 ||
    company.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/35 p-4 backdrop-blur-md sm:p-6"
      role="presentation"
      data-testid="retention-welcome-wizard"
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

        <div className="max-h-[85vh] overflow-y-auto px-6 pb-8 pt-12 sm:px-10 sm:pb-10 sm:pt-14">
          <p className="text-center text-xs font-medium tracking-wide text-accent">
            AI秘書設定 · {ui.onboarding.stepLabel(stepIndex + 1, STEPS.length)}
          </p>

          {step === "welcome" ? (
            <>
              <h2
                id="welcome-wizard-title"
                className="mt-3 text-center text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
              >
                AI秘書の設定を開始します
              </h2>
              <p className="mx-auto mt-4 max-w-md text-center text-sm leading-relaxed text-[var(--foreground-muted)] sm:text-base">
                登録から15分以内に、最低1つ「仕事が終わった」体験をお届けします。設定だけで終わりません。
              </p>
            </>
          ) : null}

          {step === "work" ? (
            <>
              <h2
                id="welcome-wizard-title"
                className="mt-3 text-center text-2xl font-semibold tracking-tight text-foreground"
              >
                仕事内容・会社・職種
              </h2>
              <p className="mx-auto mt-3 max-w-md text-center text-sm text-[var(--foreground-muted)]">
                最短で覚え、最初の成果物に反映します。
              </p>
              <div className="mt-6 space-y-4">
                <label className="block text-sm">
                  <span className="font-medium text-foreground">仕事内容</span>
                  <textarea
                    value={workDescription}
                    onChange={(event) => setWorkDescription(event.target.value)}
                    rows={3}
                    placeholder="例: 毎週の営業報告、見積作成、顧客メール"
                    className="mt-1.5 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--background-subtle)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/25"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-foreground">会社</span>
                  <input
                    value={company}
                    onChange={(event) => setCompany(event.target.value)}
                    placeholder="会社名（任意）"
                    className="mt-1.5 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--background-subtle)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/25"
                  />
                </label>
                <fieldset>
                  <legend className="text-sm font-medium text-foreground">職種</legend>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {RETENTION_ROLES.map((role) => (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => selectRole(role.id)}
                        className={cn(
                          "rounded-[var(--radius-md)] border px-3 py-2.5 text-left text-sm transition-colors",
                          roleId === role.id
                            ? "border-accent bg-[var(--accent-muted)]"
                            : "border-[var(--border-subtle)] hover:bg-[var(--background-subtle)]",
                        )}
                        aria-pressed={roleId === role.id}
                      >
                        <span className="font-medium">{role.label}</span>
                        <span className="mt-0.5 block text-xs text-[var(--foreground-muted)]">
                          {role.hint}
                        </span>
                      </button>
                    ))}
                  </div>
                </fieldset>
              </div>
            </>
          ) : null}

          {step === "automations" ? (
            <>
              <h2
                id="welcome-wizard-title"
                className="mt-3 text-center text-2xl font-semibold tracking-tight text-foreground"
              >
                使いたい自動化
              </h2>
              <p className="mx-auto mt-3 max-w-md text-center text-sm text-[var(--foreground-muted)]">
                複数選択できます。あとから変更可能です。
              </p>
              <ul className="mt-6 grid grid-cols-2 gap-2">
                {TASK_CHOICES.map((task) => (
                  <li key={task.id}>
                    <button
                      type="button"
                      onClick={() => toggleTask(task.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-[var(--radius-md)] border px-3 py-3 text-left text-sm",
                        preferredTasks.includes(task.id)
                          ? "border-accent bg-[var(--accent-muted)]"
                          : "border-[var(--border-subtle)]",
                      )}
                      aria-pressed={preferredTasks.includes(task.id)}
                    >
                      <span aria-hidden>{task.icon}</span>
                      <span className="font-medium">{task.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {step === "integrations" ? (
            <>
              <h2
                id="welcome-wizard-title"
                className="mt-3 text-center text-2xl font-semibold tracking-tight text-foreground"
              >
                つなぎたいサービス
              </h2>
              <p className="mx-auto mt-3 max-w-md text-center text-sm text-[var(--foreground-muted)]">
                Google / Dropbox / X / メール / カレンダー。今は希望だけでOKです。初回成果物に必須ではありません。
              </p>
              <ul className="mt-6 space-y-2">
                {RETENTION_INTEGRATIONS.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => toggleIntegration(item.id)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-[var(--radius-md)] border px-4 py-3 text-sm",
                        integrations.includes(item.id)
                          ? "border-accent bg-[var(--accent-muted)]"
                          : "border-[var(--border-subtle)]",
                      )}
                      aria-pressed={integrations.includes(item.id)}
                    >
                      <span className="font-medium">{item.label}</span>
                      <span className="text-xs text-[var(--foreground-muted)]">
                        {integrations.includes(item.id) ? "選択中" : "あとで設定可"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {step === "ready" ? (
            <>
              <h2
                id="welcome-wizard-title"
                className="mt-3 text-center text-2xl font-semibold tracking-tight text-foreground"
              >
                最初の成果物を作ります
              </h2>
              <p className="mx-auto mt-4 max-w-md text-center text-sm leading-relaxed text-[var(--foreground-muted)]">
                設定はここまでです。次に必ず Quick Win
                として成果物を生成します。空のホームには進みません。
              </p>
              <ul className="mx-auto mt-6 max-w-sm space-y-2 text-sm text-[var(--foreground-muted)]">
                <li>・職種: {roleMeta.label}</li>
                <li>・自動化: {preferredTasks.length}件</li>
                <li>・連携希望: {integrations.length}件</li>
              </ul>
            </>
          ) : null}

          <div className="mt-8 flex items-center justify-center gap-2" aria-hidden>
            {STEPS.map((_, index) => (
              <span
                key={index}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  index === stepIndex ? "w-6 bg-accent" : "w-1.5 bg-[var(--border-subtle)]",
                )}
              />
            ))}
          </div>

          <div className="mt-8 flex gap-3">
            {stepIndex > 0 ? (
              <Button
                variant="secondary"
                size="lg"
                className="flex-1"
                onClick={() => setStepIndex((prev) => Math.max(0, prev - 1))}
              >
                {ui.onboarding.back}
              </Button>
            ) : null}
            {isLast ? (
              <Button
                variant="primary"
                size="lg"
                className="flex-1"
                onClick={() => finish("guide")}
              >
                成果物を作る
              </Button>
            ) : (
              <Button
                variant="primary"
                size="lg"
                className="flex-1"
                disabled={!canContinue}
                onClick={() =>
                  setStepIndex((prev) => Math.min(STEPS.length - 1, prev + 1))
                }
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
