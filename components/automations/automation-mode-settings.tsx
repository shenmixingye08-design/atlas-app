"use client";

import { useState } from "react";

import type { Automation } from "@/lib/automations/types";
import type { AutomationExecutionMode, SnsBatchDays } from "@/lib/cost-optimization";
import { updateAutomation } from "@/lib/automations/client";
import { getExecutionModeShortLabel } from "@/lib/cost-optimization";
import { ui } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";

import { ExecutionModeSelector } from "./execution-mode-selector";
import { SnsBatchSelector } from "./sns-batch-selector";

type AutomationModeSettingsProps = {
  automations: Automation[];
  onUpdated: (automation: Automation) => void;
};

export function AutomationModeSettings({
  automations,
  onUpdated,
}: AutomationModeSettingsProps) {
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleModeChange = async (
    id: string,
    executionMode: AutomationExecutionMode,
  ) => {
    setUpdatingId(id);
    setError(null);
    try {
      const updated = await updateAutomation(id, { executionMode });
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.updateFailed);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleBatchChange = async (id: string, snsBatchDays: SnsBatchDays | null) => {
    setUpdatingId(id);
    setError(null);
    try {
      const updated = await updateAutomation(id, { snsBatchDays });
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.updateFailed);
    } finally {
      setUpdatingId(null);
    }
  };

  if (automations.length === 0) return null;

  return (
    <section aria-labelledby="execution-mode-settings-heading" className="space-y-4">
      <div>
        <h2 id="execution-mode-settings-heading" className="text-title text-foreground">
          {ui.costOptimization.automationSettingsTitle}
        </h2>
        <p className="mt-1 text-caption text-[var(--foreground-muted)]">
          {ui.costOptimization.automationSettingsHint}
        </p>
      </div>

      {error && <ErrorState message={error} />}

      <Card padding="lg" className="shadow-[var(--shadow-soft)]">
        <ul className="divide-y divide-[var(--border-subtle)]">
          {automations.map((automation) => {
            const isSns = automation.executionFlow.templateId === "sns_post";
            return (
              <li key={automation.id} className="space-y-4 py-4 first:pt-0 last:pb-0">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{automation.name}</p>
                    <p className="text-caption text-[var(--foreground-muted)]">
                      {ui.costOptimization.currentLabel}:{" "}
                      {getExecutionModeShortLabel(automation.executionMode)}
                    </p>
                  </div>
                  <ExecutionModeSelector
                    compact
                    value={automation.executionMode}
                    disabled={updatingId === automation.id}
                    onChange={(mode) => void handleModeChange(automation.id, mode)}
                  />
                </div>
                {isSns && automation.executionMode === "eco" && (
                  <SnsBatchSelector
                    value={automation.snsBatchDays}
                    disabled={updatingId === automation.id}
                    onChange={(days) => void handleBatchChange(automation.id, days)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}
