"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/design-system/cn";
import {
  COMPOSER_STEP_LABELS,
  COMPOSER_STEP_ORDER,
} from "@/lib/automation-platform/wizard/job-templates";
import type { WizardStepId } from "@/lib/automation-platform/wizard/types";

type ComposerShellProps = {
  title: string;
  stepIds: WizardStepId[];
  currentStepId: WizardStepId;
  savedAt: string | null;
  errorMessage: string | null;
  isSubmitting: boolean;
  canGoNext: boolean;
  nextLabel: string;
  onBack: () => void;
  onNext: () => void;
  onSaveDraft: () => void;
  /** Right pane — live summary / prediction (desktop) */
  summaryPanel?: React.ReactNode;
  children: React.ReactNode;
};

export function ComposerShell({
  title,
  stepIds,
  currentStepId,
  savedAt,
  errorMessage,
  isSubmitting,
  canGoNext,
  nextLabel,
  onBack,
  onNext,
  onSaveDraft,
  summaryPanel,
  children,
}: ComposerShellProps) {
  const visible = stepIds.filter((id): id is Exclude<WizardStepId, "complete"> => id !== "complete");
  const index = Math.max(
    0,
    currentStepId === "complete" ? visible.length - 1 : visible.indexOf(currentStepId),
  );
  const total = Math.max(1, visible.length);
  const progress = currentStepId === "complete" ? 1 : (index + 1) / total;
  const label =
    (COMPOSER_STEP_LABELS as Record<string, string>)[currentStepId] ??
    currentStepId;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[var(--background)] text-foreground">
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--surface)]/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-[0.08em] text-[var(--brand)]">
              MINERVOT
            </p>
            <h1 className="truncate text-lg font-semibold tracking-tight sm:text-xl">
              {title || "仕事を任せる"}
            </h1>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onSaveDraft}
            className="min-h-[44px] shrink-0"
          >
            下書き
          </Button>
        </div>
        <div className="mx-auto mt-3 w-full max-w-6xl">
          <div
            className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            aria-label="依頼の進捗"
          >
            <div
              className="h-full rounded-full bg-[var(--brand)] transition-[width] duration-300 motion-reduce:transition-none"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-[var(--text-secondary)]">
              {label}
              {currentStepId !== "complete" ? `（${index + 1}/${total}）` : null}
              {savedAt
                ? ` · 自動保存 ${new Date(savedAt).toLocaleTimeString("ja-JP", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`
                : " · 入力すると自動保存"}
            </p>
            <ol className="hidden gap-1 lg:flex">
              {COMPOSER_STEP_ORDER.map((id) => {
                const active = id === currentStepId;
                const done = visible.indexOf(id) < index;
                return (
                  <li
                    key={id}
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px]",
                      active
                        ? "bg-[var(--brand)] text-[var(--brand-foreground)]"
                        : done
                          ? "bg-[var(--surface-muted)] text-[var(--text-secondary)]"
                          : "text-[var(--text-muted)]",
                    )}
                  >
                    {COMPOSER_STEP_LABELS[id]}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)] lg:gap-6 lg:px-4">
        <main
          className={cn(
            "w-full flex-1 overflow-y-auto px-4 py-4",
            "pb-[calc(6.5rem+env(safe-area-inset-bottom))] lg:pb-8",
          )}
        >
          {errorMessage ? (
            <div
              role="alert"
              className="mb-4 rounded-2xl border border-[var(--error)]/30 bg-[var(--error-bg)] px-4 py-3 text-sm text-[var(--error)]"
            >
              {errorMessage}
            </div>
          ) : null}
          {children}
        </main>

        {summaryPanel && currentStepId !== "complete" ? (
          <aside className="hidden lg:block lg:sticky lg:top-[7.5rem] lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto lg:py-4">
            {summaryPanel}
          </aside>
        ) : null}
      </div>

      {/* Mobile: compact summary sheet peek */}
      {summaryPanel && currentStepId !== "complete" ? (
        <div className="border-t border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 lg:hidden">
          <details className="group">
            <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between text-sm font-medium">
              <span>いまの依頼内容を見る</span>
              <span className="text-[var(--text-muted)] group-open:hidden">開く</span>
              <span className="hidden text-[var(--text-muted)] group-open:inline">閉じる</span>
            </summary>
            <div className="mt-3 max-h-[40vh] overflow-y-auto pb-2">{summaryPanel}</div>
          </details>
        </div>
      ) : null}

      {currentStepId !== "complete" ? (
        <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[var(--surface)]/95 px-4 pt-3 backdrop-blur pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:static lg:border-0 lg:bg-transparent lg:px-0 lg:pb-6 lg:pt-0">
          <div className="mx-auto flex w-full max-w-6xl gap-3 lg:px-4">
            <Button
              type="button"
              variant="secondary"
              className="min-h-[48px] flex-1"
              onClick={onBack}
              disabled={isSubmitting}
            >
              戻る
            </Button>
            <Button
              type="button"
              className="min-h-[48px] flex-[1.4]"
              onClick={onNext}
              disabled={!canGoNext || isSubmitting}
              isLoading={isSubmitting}
            >
              {nextLabel}
            </Button>
          </div>
        </footer>
      ) : null}
    </div>
  );
}
