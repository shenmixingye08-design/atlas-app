"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { WordProgressStatus } from "@/components/deliverables/word-progress-status";
import {
  WORD_JOB_UI_COPY,
  type WordJobUiPhase,
} from "@/lib/deliverables/word-job-ui-state";
import { cn } from "@/lib/design-system/cn";

export type WordJobStatusPanelProps = {
  phase: WordJobUiPhase;
  /** Safe user-facing failure detail (never empty on failed). */
  detail?: string | null;
  busy?: boolean;
  onPrimary?: () => void;
  onSecondary?: () => void;
  className?: string;
};

/**
 * Post-submit Word status for mobile — one clear state + next actions.
 * Not a deliverable empty state and not a notification empty state.
 */
export function WordJobStatusPanel({
  phase,
  detail = null,
  busy = false,
  onPrimary,
  onSecondary,
  className,
}: WordJobStatusPanelProps) {
  const copy = WORD_JOB_UI_COPY[phase];
  const showProgress = phase === "accepted" || phase === "processing";
  const showDetail =
    (phase === "failed" || phase === "timed_out") && Boolean(detail);

  return (
    <section
      className={cn(
        "mx-auto w-full max-w-lg space-y-4 animate-fade-in px-1",
        className,
      )}
      aria-live="polite"
      aria-busy={busy || showProgress}
      role="status"
    >
      <Card padding="lg" className="space-y-4 text-center sm:px-8">
        <p className="text-sm font-medium text-accent">MINERVOT</p>
        <h2
          id="word-job-status-title"
          className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
        >
          {copy.title}
        </h2>
        {copy.description ? (
          <p className="text-base leading-relaxed text-[var(--foreground-muted)]">
            {copy.description}
          </p>
        ) : null}
        {showDetail ? (
          <p className="rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-4 py-3 text-left text-sm leading-relaxed text-[var(--text-secondary)]">
            {detail}
          </p>
        ) : null}
        {showProgress ? (
          <WordProgressStatus className="animate-soft-pulse text-sm text-[var(--foreground-muted)]" />
        ) : null}

        {(copy.primaryAction || copy.secondaryAction) && (
          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-center">
            {copy.primaryAction && onPrimary ? (
              <Button
                type="button"
                variant="primary"
                size="lg"
                className="min-h-12 w-full touch-manipulation sm:min-w-[10rem] sm:w-auto"
                disabled={busy}
                aria-describedby="word-job-status-title"
                onClick={onPrimary}
              >
                {copy.primaryAction}
              </Button>
            ) : null}
            {copy.secondaryAction && onSecondary ? (
              <Button
                type="button"
                variant="secondary"
                size="lg"
                className="min-h-12 w-full touch-manipulation sm:min-w-[10rem] sm:w-auto"
                disabled={busy}
                aria-describedby="word-job-status-title"
                onClick={onSecondary}
              >
                {copy.secondaryAction}
              </Button>
            ) : null}
          </div>
        )}
      </Card>
    </section>
  );
}
