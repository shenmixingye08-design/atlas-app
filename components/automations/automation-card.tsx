"use client";

import type { Automation } from "@/lib/automations/types";
import {
  formatAutomationDateTime,
  formatAutomationTimestamp,
} from "@/lib/automations/client";
import {
  ENTRUSTED_JOB_STATUS_LABELS,
  describeMaterialsAndMemory,
  getConfirmationScopeLabel,
  resolveEntrustedJobStatus,
  resolveScheduleMethod,
  formatAutomationSuccessRate,
  type EntrustedJobStatus,
} from "@/lib/automations/display";
import { ui } from "@/lib/i18n";
import { cn } from "@/lib/design-system/cn";
import { Card } from "@/components/ui/card";
import { StatusChip, type StatusVariant } from "@/components/ui/status-chip";

type AutomationCardProps = {
  automation: Automation;
  onOpen: (automation: Automation) => void;
  onToggleEnabled: (id: string, enabled: boolean) => void;
  isUpdating: boolean;
};

function formatSuccessRate(automation: Automation): string {
  return formatAutomationSuccessRate(automation);
}

function statusToChip(status: EntrustedJobStatus): StatusVariant {
  switch (status) {
    case "running":
      return "running";
    case "completed":
      return "completed";
    case "error":
      return "error";
    case "needs_review":
      return "warning";
    case "paused":
      return "waiting";
    default:
      return "info";
  }
}

export function AutomationCard({
  automation,
  onOpen,
  onToggleEnabled,
  isUpdating,
}: AutomationCardProps) {
  const status = resolveEntrustedJobStatus(automation);
  const schedule = resolveScheduleMethod(automation.schedule);

  return (
    <Card
      padding="lg"
      className={cn(
        "border border-[var(--border-subtle)] bg-[var(--card)] transition-shadow hover:shadow-[var(--shadow-md)]",
        !automation.enabled && "opacity-80",
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <button
          type="button"
          onClick={() => onOpen(automation)}
          className="min-w-0 flex-1 text-left focus-ring rounded-[var(--radius-lg)]"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">
              {automation.name}
            </h2>
            <StatusChip
              status={statusToChip(status)}
              label={ENTRUSTED_JOB_STATUS_LABELS[status]}
            />
          </div>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
            {automation.description || automation.workflow.assignment}
          </p>
        </button>

        <label className="flex min-h-[48px] shrink-0 items-center gap-3 self-start rounded-full bg-[var(--surface-muted)] px-3 py-2">
          <span className="text-xs font-medium text-[var(--text-secondary)]">
            {automation.enabled ? ui.phase4.toggleEnabled : ui.phase4.toggleDisabled}
          </span>
          <input
            type="checkbox"
            className="peer sr-only"
            checked={automation.enabled}
            disabled={isUpdating || automation.status === "running"}
            onChange={(event) =>
              onToggleEnabled(automation.id, event.target.checked)
            }
            aria-label={
              automation.enabled
                ? ui.entrustedJobs.pause
                : ui.entrustedJobs.resume
            }
          />
          <span className="relative h-7 w-12 rounded-full bg-[var(--background-subtle)] transition-colors duration-[var(--motion-base)] peer-checked:bg-accent peer-disabled:opacity-50 after:absolute after:left-0.5 after:top-0.5 after:h-6 after:w-6 after:rounded-full after:bg-[var(--card)] after:shadow-[var(--shadow-sm)] after:transition-transform after:duration-[var(--motion-base)] peer-checked:after:translate-x-5" />
        </label>
      </div>

      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-[var(--radius-xl)] bg-[var(--surface-muted)] px-3 py-3">
          <dt className="text-xs text-[var(--text-muted)]">
            {ui.entrustedJobs.scheduleMethod}
          </dt>
          <dd className="mt-1 font-medium text-foreground">
            {schedule.supported ? schedule.label : ui.entrustedJobs.comingSoon}
            <span className="mt-0.5 block text-xs font-normal text-[var(--text-secondary)]">
              {ui.entrustedJobs.manualAlsoAvailable}
            </span>
          </dd>
        </div>
        <div className="rounded-[var(--radius-xl)] bg-[var(--surface-muted)] px-3 py-3">
          <dt className="text-xs text-[var(--text-muted)]">
            {ui.entrustedJobs.nextRun}
          </dt>
          <dd className="mt-1 font-medium text-foreground">
            {automation.enabled
              ? formatAutomationDateTime(automation.nextRun)
              : "—"}
            {automation.enabled && automation.nextRun && (
              <span className="ml-1 text-xs font-normal text-[var(--text-secondary)]">
                ({formatAutomationTimestamp(automation.nextRun)})
              </span>
            )}
          </dd>
        </div>
        <div className="rounded-[var(--radius-xl)] bg-[var(--surface-muted)] px-3 py-3">
          <dt className="text-xs text-[var(--text-muted)]">
            {ui.entrustedJobs.lastRun}
          </dt>
          <dd className="mt-1 font-medium text-foreground">
            {formatAutomationDateTime(automation.lastRun)}
          </dd>
        </div>
        <div className="rounded-[var(--radius-xl)] bg-[var(--surface-muted)] px-3 py-3">
          <dt className="text-xs text-[var(--text-muted)]">
            {ui.entrustedJobs.statusLabel}
          </dt>
          <dd className="mt-1 font-medium text-foreground">
            {ENTRUSTED_JOB_STATUS_LABELS[status]}
            {!automation.enabled
              ? ` / ${ui.phase4.toggleDisabled}`
              : ` / ${ui.phase4.toggleEnabled}`}
          </dd>
        </div>
        <div className="rounded-[var(--radius-xl)] bg-[var(--surface-muted)] px-3 py-3">
          <dt className="text-xs text-[var(--text-muted)]">
            {ui.entrustedJobs.failureCount}
          </dt>
          <dd className="mt-1 font-medium text-foreground">
            {automation.failureCount ?? 0}
          </dd>
        </div>
        <div className="rounded-[var(--radius-xl)] bg-[var(--surface-muted)] px-3 py-3">
          <dt className="text-xs text-[var(--text-muted)]">
            {ui.entrustedJobs.successRate}
          </dt>
          <dd className="mt-1 font-medium text-foreground">
            {formatSuccessRate(automation)}
          </dd>
        </div>
        <div className="rounded-[var(--radius-xl)] bg-[var(--surface-muted)] px-3 py-3">
          <dt className="text-xs text-[var(--text-muted)]">
            {ui.entrustedJobs.confirmationScope}
          </dt>
          <dd className="mt-1 font-medium text-foreground">
            {getConfirmationScopeLabel(automation.executionLevel)}
          </dd>
        </div>
        <div className="rounded-[var(--radius-xl)] bg-[var(--surface-muted)] px-3 py-3 sm:col-span-2">
          <dt className="text-xs text-[var(--text-muted)]">
            {ui.entrustedJobs.materials}
          </dt>
          <dd className="mt-1 font-medium text-foreground">
            {describeMaterialsAndMemory(automation)}
          </dd>
        </div>
      </dl>

      {automation.lastError && automation.status === "failed" && (
        <p className="mt-4 rounded-[var(--radius-lg)] border border-[var(--status-error)]/20 bg-[var(--status-error-bg)] px-3 py-2 text-xs text-[var(--status-error)]">
          {automation.lastError}
        </p>
      )}

      <div className="mt-4">
        <button
          type="button"
          onClick={() => onOpen(automation)}
          className="touch-target text-sm font-medium text-accent hover:underline focus-ring rounded-md"
        >
          {ui.entrustedJobs.viewDetail}
        </button>
      </div>
    </Card>
  );
}
