"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  WORD_JOB_UI_COPY,
  type WordJobUiPhase,
} from "@/lib/deliverables/word-job-ui-state";
import {
  JOB_SLOW_BANNER,
  labelForProgressPhase,
  type JobProgressPhase,
} from "@/lib/work-jobs/progress";
import { cn } from "@/lib/design-system/cn";

export type WordJobStatusPanelProps = {
  phase: WordJobUiPhase;
  /** Real progress phase from the server (must match pipeline). */
  progressPhase?: JobProgressPhase | null;
  progressLabel?: string | null;
  /** Show “taking longer” banner while still processing. */
  isSlow?: boolean;
  /** Safe user-facing failure / timeout detail. */
  detail?: string | null;
  busy?: boolean;
  onPrimary?: () => void;
  onSecondary?: () => void;
  className?: string;
};

/**
 * Post-submit job status — one clear state + next actions.
 * Progress labels come from the server; never invent stages.
 */
export function WordJobStatusPanel({
  phase,
  progressPhase = null,
  progressLabel = null,
  isSlow = false,
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
  const resolvedProgressLabel =
    progressLabel?.trim() ||
    (progressPhase ? labelForProgressPhase(progressPhase) : null) ||
    (phase === "accepted"
      ? labelForProgressPhase("accepted")
      : phase === "processing"
        ? labelForProgressPhase("ai_content")
        : null);

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
          <p className="whitespace-pre-line text-base leading-relaxed text-[var(--foreground-muted)]">
            {copy.description}
          </p>
        ) : null}
        {showProgress && resolvedProgressLabel ? (
          <p
            className="animate-soft-pulse text-sm font-medium text-[var(--foreground-muted)]"
            data-testid="job-progress-label"
          >
            {resolvedProgressLabel}
          </p>
        ) : null}
        {showProgress && isSlow ? (
          <p
            className="whitespace-pre-line rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-4 py-3 text-left text-sm leading-relaxed text-[var(--text-secondary)]"
            data-testid="job-slow-banner"
          >
            {JOB_SLOW_BANNER}
          </p>
        ) : null}
        {showDetail ? (
          <p className="rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-4 py-3 text-left text-sm leading-relaxed text-[var(--text-secondary)]">
            {detail}
          </p>
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
