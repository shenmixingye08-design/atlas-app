"use client";

import { cn } from "@/lib/design-system/cn";
import type { AiEmployeeDisplayState } from "@/lib/ai-employees";
import { ui } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress";
import { StatusChip } from "@/components/ui/status-chip";

type AiEmployeesPanelProps = {
  employees: readonly AiEmployeeDisplayState[];
  compact?: boolean;
};

const STATUS_LABELS = ui.aiEmployees.status;

function statusLabel(status: AiEmployeeDisplayState["status"]): string {
  switch (status) {
    case "running":
      return STATUS_LABELS.running;
    case "completed":
      return STATUS_LABELS.completed;
    case "error":
      return STATUS_LABELS.error;
    default:
      return STATUS_LABELS.waiting;
  }
}

function AiEmployeeCard({
  employee,
  compact,
}: {
  employee: AiEmployeeDisplayState;
  compact?: boolean;
}) {
  const isActive = employee.status === "running";

  return (
    <article
      className={cn(
        "rounded-[var(--radius-xl)] border p-4 transition-all duration-[var(--motion-base)] sm:p-5",
        isActive
          ? "border-accent/30 bg-accent/5 animate-status-in"
          : employee.status === "completed"
            ? "border-[var(--border)] bg-white shadow-[var(--shadow-sm)]"
            : employee.status === "error"
              ? "border-[var(--status-error)]/25 bg-[var(--status-error-bg)]"
              : "border-[var(--border)] bg-[var(--background-subtle)]",
      )}
    >
      <div className={cn("flex gap-4", compact && "gap-3")}>
        <div
          className={cn(
            "flex shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--background-subtle)] ring-1 ring-[var(--border)]",
            compact ? "h-10 w-10 text-xl" : "h-12 w-12 text-2xl",
          )}
          aria-hidden="true"
        >
          {employee.icon}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-foreground sm:text-base">
                {employee.name}
              </h3>
              <p
                className={cn(
                  "text-caption",
                  isActive && "font-medium text-foreground",
                )}
              >
                {employee.task}
              </p>
            </div>
            <StatusChip
              status={employee.status}
              label={statusLabel(employee.status)}
            />
          </div>

          {isActive && (
            <div className="mt-3">
              <ProgressBar value={55} size="sm" indeterminate />
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export function AiEmployeesPanel({ employees, compact = false }: AiEmployeesPanelProps) {
  if (employees.length === 0) {
    return null;
  }

  return (
    <Card padding="lg" className="animate-fade-in">
      <div className="space-y-2 text-center sm:text-left">
        <p className="text-caption">{ui.aiEmployees.panelTitle}</p>
        <p className="text-sm text-[var(--foreground-muted)]">
          {ui.aiEmployees.panelHint}
        </p>
      </div>

      <ul
        className={cn(
          "mt-6 grid gap-3",
          compact ? "sm:grid-cols-2" : "lg:grid-cols-2",
        )}
      >
        {employees.map((employee) => (
          <li key={employee.id}>
            <AiEmployeeCard employee={employee} compact={compact} />
          </li>
        ))}
      </ul>
    </Card>
  );
}
