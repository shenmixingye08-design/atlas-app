"use client";

import { useState } from "react";

import type { Automation } from "@/lib/automations/types";
import {
  formatAutomationDateTime,
  runAutomationNow,
} from "@/lib/automations/client";
import { ui } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { StatusChip } from "@/components/ui/status-chip";

type DashboardAutomationProps = {
  upcoming: Automation[];
  allAutomations: Automation[];
  onRefresh: () => void;
};

export function DashboardAutomation({
  upcoming,
  allAutomations,
  onRefresh,
}: DashboardAutomationProps) {
  const [runningId, setRunningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async (id: string) => {
    setRunningId(id);
    setError(null);
    try {
      await runAutomationNow(id);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.runFailed);
    } finally {
      setRunningId(null);
    }
  };

  const nextJob = upcoming[0];

  return (
    <section aria-labelledby="automation-heading">
      <h2 id="automation-heading" className="text-title text-foreground">
        {ui.automations.title}
      </h2>
      <p className="mt-1 text-caption">{ui.automations.subtitle}</p>

      <Card variant="elevated" padding="md" className="mt-5">
        {error && <ErrorState message={error} className="mb-4" />}

        {nextJob && (
          <div className="mb-5 rounded-[var(--radius-xl)] border border-accent/20 bg-accent/5 p-4">
            <p className="text-overline">{ui.automations.nextExecution}</p>
            <p className="mt-1 text-base font-semibold text-foreground">
              {nextJob.name}
            </p>
            <p className="mt-1 text-caption">
              {nextJob.schedule.label} ·{" "}
              {formatAutomationDateTime(nextJob.nextRun)}
            </p>
          </div>
        )}

        <ul className="space-y-3">
          {(upcoming.length > 0 ? upcoming : allAutomations.slice(0, 4)).map(
            (automation) => (
              <li
                key={automation.id}
                className="flex flex-col gap-3 rounded-[var(--radius-lg)] bg-[var(--background-subtle)] p-4 ring-1 ring-[var(--border)] sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-foreground">
                      {automation.name}
                    </p>
                    <StatusChip
                      status={
                        automation.status === "running"
                          ? "running"
                          : automation.status === "failed"
                            ? "error"
                            : automation.enabled
                              ? "completed"
                              : "waiting"
                      }
                      label={automation.schedule.label}
                    />
                    {!automation.enabled && (
                      <Badge variant="default">{ui.automations.disabled}</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-caption truncate">
                    {automation.description}
                  </p>
                  {automation.nextRun && (
                    <p className="mt-1 text-caption">
                      {ui.automations.nextRun(
                        formatAutomationDateTime(automation.nextRun),
                      )}
                    </p>
                  )}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!automation.enabled || runningId !== null}
                  isLoading={runningId === automation.id}
                  onClick={() => void handleRun(automation.id)}
                >
                  {ui.actions.manualRun}
                </Button>
              </li>
            ),
          )}
        </ul>

        {allAutomations.length === 0 && (
          <p className="py-6 text-center text-caption">
            {ui.automations.emptyConfigured}
          </p>
        )}
      </Card>
    </section>
  );
}
