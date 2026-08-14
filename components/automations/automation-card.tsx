"use client";

import type { Automation } from "@/lib/automations/types";
import {
  AUTOMATION_USER_STATUS_LABEL,
  buildAutomationPreview,
  explainAutomationFailure,
  formatFirstSuccessCopy,
  resolveAutomationUserStatus,
} from "@/lib/automations/ux";
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

function statusToChip(
  status: ReturnType<typeof resolveAutomationUserStatus>,
): StatusVariant {
  switch (status) {
    case "waiting":
      return "running";
    case "failed":
    case "needs_attention":
      return "error";
    case "awaiting_approval":
    case "retrying":
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
  const preview = buildAutomationPreview(automation);
  const status = resolveAutomationUserStatus(automation);
  const firstSuccess = formatFirstSuccessCopy(automation);
  const failure =
    status === "failed" || status === "needs_attention"
      ? explainAutomationFailure(
          automation.lastError,
          automation.runHistory?.[0]?.errorCode,
        )
      : null;

  return (
    <Card
      padding="lg"
      className={cn(
        "overflow-hidden border border-[var(--border-subtle)] bg-[var(--card)]",
        !automation.enabled && "opacity-80",
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <button
          type="button"
          onClick={() => onOpen(automation)}
          className="min-h-[44px] min-w-0 flex-1 rounded-[var(--radius-lg)] text-left focus-ring"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="break-words text-base font-semibold text-foreground">
              {preview.name}
            </h2>
            <StatusChip
              status={statusToChip(status)}
              label={AUTOMATION_USER_STATUS_LABEL[status]}
            />
          </div>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {preview.action}
          </p>
        </button>

        <button
          type="button"
          disabled={isUpdating || automation.status === "running"}
          onClick={() => onToggleEnabled(automation.id, !automation.enabled)}
          className="min-h-[44px] shrink-0 self-start rounded-full bg-[var(--surface-muted)] px-4 text-sm font-medium text-foreground focus-ring disabled:opacity-50"
        >
          {automation.enabled ? ui.entrustedJobs.pause : ui.entrustedJobs.resume}
        </button>
      </div>

      <dl className="mt-4 grid gap-2 text-sm">
        <div className="rounded-[var(--radius-xl)] bg-[var(--surface-muted)] px-3 py-3">
          <dt className="text-xs text-[var(--text-muted)]">繰り返し</dt>
          <dd className="mt-1 font-medium text-foreground">{preview.frequency}</dd>
        </div>
        <div className="rounded-[var(--radius-xl)] bg-[var(--surface-muted)] px-3 py-3">
          <dt className="text-xs text-[var(--text-muted)]">次回</dt>
          <dd className="mt-1 font-medium text-foreground">{preview.nextRunLabel}</dd>
        </div>
        {preview.memoryLabels.length > 0 ? (
          <div className="rounded-[var(--radius-xl)] bg-[var(--surface-muted)] px-3 py-3">
            <dt className="text-xs text-[var(--text-muted)]">
              {ui.entrustedJobs.appliedPreferences}
            </dt>
            <dd className="mt-1 break-words font-medium text-foreground">
              {preview.memoryLabels.join("、")}
            </dd>
          </div>
        ) : null}
        {preview.overrideLabels.length > 0 ? (
          <div className="rounded-[var(--radius-xl)] bg-[var(--surface-muted)] px-3 py-3">
            <dt className="text-xs text-[var(--text-muted)]">この自動化だけ</dt>
            <dd className="mt-1 break-words font-medium text-foreground">
              {preview.overrideLabels.join("、")}
            </dd>
          </div>
        ) : null}
      </dl>

      {firstSuccess ? (
        <p className="mt-3 rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-secondary)]">
          {firstSuccess}
        </p>
      ) : null}

      {failure ? (
        <p className="mt-3 rounded-[var(--radius-lg)] border border-[var(--status-error)]/20 bg-[var(--status-error-bg)] px-3 py-2 text-sm text-[var(--status-error)]">
          {failure.title}。{failure.body}
        </p>
      ) : null}

      <div className="mt-4">
        <button
          type="button"
          onClick={() => onOpen(automation)}
          className="min-h-[44px] text-sm font-medium text-accent hover:underline focus-ring rounded-md"
        >
          {ui.entrustedJobs.viewDetail}
        </button>
      </div>
    </Card>
  );
}
