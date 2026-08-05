"use client";

import { cn } from "@/lib/design-system/cn";
import {
  messageForOpsProgressStage,
  type OpsProgressStage,
} from "@/lib/reliability/ops-progress";

type OpsProgressStatusProps = {
  stage: OpsProgressStage;
  className?: string;
};

/** P06: Always show a concrete loading stage while work is in flight. */
export function OpsProgressStatus({
  stage,
  className,
}: OpsProgressStatusProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-4 py-3",
        className,
      )}
    >
      <p className="whitespace-pre-line text-sm text-[var(--text-primary)]">
        {messageForOpsProgressStage(stage)}
      </p>
    </div>
  );
}
