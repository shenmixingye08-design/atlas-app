"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ui } from "@/lib/i18n";
import type { WorkFailureInfo } from "@/lib/work-progress/failure";

type WorkFailurePanelProps = {
  failure: WorkFailureInfo;
  onRetry: () => void;
  isRetrying?: boolean;
};

export function WorkFailurePanel({
  failure,
  onRetry,
  isRetrying = false,
}: WorkFailurePanelProps) {
  return (
    <Card
      padding="lg"
      className="space-y-4 border-red-400/30 bg-red-500/5"
      aria-label={ui.workProgress.failureHeading}
    >
      <div>
        <p className="text-xs font-semibold tracking-wide text-accent">
          {ui.workProgress.failureHeading}
        </p>
        <h2 className="mt-1 text-lg font-semibold text-foreground">
          {ui.workProgress.failureTitle}
        </h2>
      </div>

      <dl className="space-y-3 text-sm">
        <div>
          <dt className="font-medium text-[var(--foreground-muted)]">
            {ui.workProgress.failureCause}
          </dt>
          <dd className="mt-1 text-foreground">{failure.cause}</dd>
        </div>
        <div>
          <dt className="font-medium text-[var(--foreground-muted)]">
            {ui.workProgress.failureStoppedAt}
          </dt>
          <dd className="mt-1 text-foreground">{failure.stoppedAtLabel}</dd>
        </div>
      </dl>

      {failure.autoRetryMessage ? (
        <p className="rounded-[16px] border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-foreground">
          {failure.autoRetryMessage}
        </p>
      ) : (
        <p className="text-sm text-[var(--foreground-muted)]">
          {ui.workProgress.failureNoContact}
        </p>
      )}

      {failure.canRetry ? (
        <Button
          type="button"
          onClick={onRetry}
          disabled={isRetrying}
          className="w-full sm:w-auto"
        >
          {isRetrying ? ui.workProgress.retrying : ui.workProgress.retry}
        </Button>
      ) : null}
    </Card>
  );
}
