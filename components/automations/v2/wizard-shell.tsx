"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/design-system/cn";
import type { WizardStepId } from "@/lib/automation-platform/wizard/types";

const STEP_LABELS: Record<WizardStepId, string> = {
  work: "仕事",
  timing: "タイミング",
  steps: "やること",
  details: "詳細",
  approval: "確認",
  notifications: "通知",
  memory: "好み",
  notes: "備考",
  review: "確認",
  complete: "完了",
};

type WizardShellProps = {
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
  children: React.ReactNode;
};

export function WizardShell({
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
  children,
}: WizardShellProps) {
  const index = Math.max(0, stepIds.indexOf(currentStepId));
  const total = Math.max(1, stepIds.filter((id) => id !== "complete").length);
  const progress = currentStepId === "complete" ? 1 : (index + 1) / total;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[var(--background)] text-foreground">
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--surface)]/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
        <div className="mx-auto flex w-full max-w-xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-[var(--text-secondary)]">自動化</p>
            <h1 className="truncate text-lg font-semibold tracking-tight">
              {title}
            </h1>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onSaveDraft}
            className="shrink-0"
          >
            下書き保存
          </Button>
        </div>
        <div className="mx-auto mt-3 w-full max-w-xl">
          <div
            className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            aria-label="作成の進捗"
          >
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-300 motion-reduce:transition-none"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-[var(--text-secondary)]">
            {STEP_LABELS[currentStepId]}
            {currentStepId !== "complete"
              ? `（${index + 1}/${total}）`
              : null}
            {savedAt
              ? ` · 下書き ${new Date(savedAt).toLocaleTimeString("ja-JP", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}`
              : null}
          </p>
        </div>
      </header>

      <main
        className={cn(
          "mx-auto w-full max-w-xl flex-1 overflow-y-auto px-4 py-4",
          "pb-[calc(6.5rem+env(safe-area-inset-bottom))]",
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

      {currentStepId !== "complete" ? (
        <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[var(--surface)]/95 px-4 pt-3 backdrop-blur pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex w-full max-w-xl gap-3">
            <Button
              type="button"
              variant="secondary"
              className="min-w-[6rem] flex-1"
              onClick={onBack}
              disabled={isSubmitting || index === 0}
            >
              戻る
            </Button>
            <Button
              type="button"
              className="flex-[2]"
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
