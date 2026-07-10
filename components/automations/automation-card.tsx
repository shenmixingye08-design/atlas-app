"use client";

import type { Automation } from "@/lib/automations/types";
import {
  formatAutomationDateTime,
  formatAutomationTimestamp,
} from "@/lib/automations/client";
import { ui } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";

import { ExecutionLevelBadge } from "./execution-level-selector";
import { ExecutionModeBadge } from "./execution-mode-selector";
import { ExecutionFlowSummary } from "./execution-flow-summary";

type AutomationCardProps = {
  automation: Automation;
  onToggleEnabled: (id: string, enabled: boolean) => void;
  onRunNow: (id: string) => void;
  isRunning: boolean;
  isUpdating: boolean;
};

function statusVariant(
  status: Automation["status"],
): "running" | "completed" | "error" | "waiting" {
  switch (status) {
    case "running":
      return "running";
    case "success":
      return "completed";
    case "failed":
      return "error";
    default:
      return "waiting";
  }
}

function statusLabel(status: Automation["status"]): string {
  switch (status) {
    case "running":
      return "実行中";
    case "success":
      return "成功";
    case "failed":
      return "失敗";
    default:
      return "待機";
  }
}

export function AutomationCard({
  automation,
  onToggleEnabled,
  onRunNow,
  isRunning,
  isUpdating,
}: AutomationCardProps) {
  const scheduleLabel =
    automation.schedule.kind === "schedule"
      ? automation.schedule.label
      : automation.schedule.label;

  return (
    <Card padding="lg" className="atlas-lift">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">
              {automation.name}
            </h2>
            <StatusChip
              status={statusVariant(automation.status)}
              label={statusLabel(automation.status)}
            />
            {!automation.enabled && (
              <span className="text-caption">{ui.automations.disabled}</span>
            )}
            <ExecutionLevelBadge level={automation.executionLevel} />
            <ExecutionModeBadge mode={automation.executionMode} />
          </div>
          <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
            {automation.description}
          </p>
          <div className="mt-4">
            <ExecutionFlowSummary flow={automation.executionFlow} />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <Button
            variant="primary"
            size="sm"
            disabled={isRunning || isUpdating}
            isLoading={isRunning}
            onClick={() => onRunNow(automation.id)}
          >
            {isRunning ? "実行中…" : ui.actions.manualRun}
          </Button>

          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={automation.enabled}
              disabled={isUpdating || automation.status === "running"}
              onChange={(event) =>
                onToggleEnabled(automation.id, event.target.checked)
              }
            />
            <span className="h-7 w-12 rounded-full bg-[var(--background-subtle)] transition-colors duration-[var(--motion-base)] peer-checked:bg-accent peer-disabled:opacity-50 after:absolute after:left-0.5 after:top-0.5 after:h-6 after:w-6 after:rounded-full after:bg-white after:shadow-[var(--shadow-sm)] after:transition-transform after:duration-[var(--motion-base)] peer-checked:after:translate-x-5" />
          </label>
        </div>
      </div>

      <dl className="mt-6 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <div className="atlas-surface-subtle px-3 py-2.5">
          <dt className="text-overline">スケジュール</dt>
          <dd className="mt-1 font-medium text-foreground">{scheduleLabel}</dd>
        </div>
        <div className="atlas-surface-subtle px-3 py-2.5">
          <dt className="text-overline">最終実行</dt>
          <dd className="mt-1 font-medium text-foreground">
            {formatAutomationDateTime(automation.lastRun)}
            {automation.lastRun && (
              <span className="ml-1 text-caption">
                ({formatAutomationTimestamp(automation.lastRun)})
              </span>
            )}
          </dd>
        </div>
        <div className="atlas-surface-subtle px-3 py-2.5">
          <dt className="text-overline">次回実行</dt>
          <dd className="mt-1 font-medium text-foreground">
            {automation.enabled
              ? formatAutomationDateTime(automation.nextRun)
              : "—"}
            {automation.enabled && automation.nextRun && (
              <span className="ml-1 text-caption">
                ({formatAutomationTimestamp(automation.nextRun)})
              </span>
            )}
          </dd>
        </div>
        <div className="atlas-surface-subtle px-3 py-2.5">
          <dt className="text-overline">{ui.requestScope.cardLabel}</dt>
          <dd className="mt-1 font-medium text-foreground">
            <ExecutionLevelBadge level={automation.executionLevel} />
          </dd>
        </div>
        <div className="atlas-surface-subtle px-3 py-2.5 sm:col-span-2 lg:col-span-1">
          <dt className="text-overline">トリガー</dt>
          <dd className="mt-1 font-medium text-foreground">
            {automation.schedule.kind === "schedule"
              ? "スケジュール"
              : automation.schedule.kind}
          </dd>
        </div>
      </dl>

      {automation.lastError && automation.status === "failed" && (
        <p className="mt-4 rounded-[var(--radius-lg)] border border-[var(--status-error)]/20 bg-[var(--status-error-bg)] px-3 py-2 text-xs text-[var(--status-error)]">
          {automation.lastError}
        </p>
      )}
    </Card>
  );
}
