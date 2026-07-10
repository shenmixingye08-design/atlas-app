"use client";

import type { StepStatus } from "@/lib/workspace/types";
import { cn } from "@/lib/design-system/cn";
import { ui } from "@/lib/i18n";
import { ProgressBar } from "@/components/ui/progress";
import { StatusChip } from "@/components/ui/status-chip";

type StageCardProps = {
  label: string;
  subtitle: string;
  status: StepStatus;
  output?: string;
  durationMs?: number;
  errorMessage?: string;
  index?: number;
  icon?: string;
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function StageCard({
  label,
  subtitle,
  status,
  output,
  durationMs,
  errorMessage,
  index,
  icon,
}: StageCardProps) {
  const isActive = status === "running";

  return (
    <article
      className={cn(
        "rounded-[var(--radius-xl)] border p-4 transition-all duration-[var(--motion-base)] sm:p-5 animate-status-in",
        isActive
          ? "border-accent/30 bg-accent/5"
          : status === "completed"
            ? "border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-sm)]"
            : status === "error"
              ? "border-[var(--status-error)]/25 bg-[var(--status-error-bg)]"
              : "border-[var(--border)] bg-[var(--background-subtle)]",
      )}
    >
      <div className="flex gap-4">
        {icon && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--background-subtle)] text-lg ring-1 ring-[var(--border)]">
            {icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              {index !== undefined && (
                <p className="text-overline mb-1">{ui.workflowPhases.stage(index + 1)}</p>
              )}
              <h3 className="text-sm font-semibold text-foreground sm:text-base">
                {label}
              </h3>
              <p className="text-caption">{subtitle}</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusChip status={status} />
              {durationMs !== undefined && status === "completed" && (
                <span className="text-caption tabular-nums">
                  {formatDuration(durationMs)}
                </span>
              )}
            </div>
          </div>

          {isActive && (
            <div className="mt-3">
              <ProgressBar value={55} size="sm" indeterminate />
            </div>
          )}

          {status === "error" && errorMessage && (
            <p className="mt-3 rounded-[var(--radius-md)] bg-[var(--status-error-bg)] px-3 py-2 text-sm text-[var(--status-error)]">
              {errorMessage}
            </p>
          )}

          {output && (status === "completed" || status === "error") && (
            <pre className="mt-3 max-h-64 overflow-auto rounded-[var(--radius-lg)] bg-[var(--background-subtle)] p-4 text-xs leading-relaxed whitespace-pre-wrap text-[var(--foreground-muted)] ring-1 ring-[var(--border)]">
              {output}
            </pre>
          )}
        </div>
      </div>
    </article>
  );
}
