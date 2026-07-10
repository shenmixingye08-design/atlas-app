"use client";

import { useState } from "react";

import type { Automation } from "@/lib/automations/types";
import type { AutomationExecutionLevel } from "@/lib/automations/types";
import { updateAutomation } from "@/lib/automations/client";
import { getExecutionLevelShortLabel } from "@/lib/automations/execution-level";
import { ui } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";

import { ExecutionLevelSelector } from "./execution-level-selector";

type AutomationLevelSettingsProps = {
  automations: Automation[];
  onUpdated: (automation: Automation) => void;
};

export function AutomationLevelSettings({
  automations,
  onUpdated,
}: AutomationLevelSettingsProps) {
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleChange = async (id: string, executionLevel: AutomationExecutionLevel) => {
    setUpdatingId(id);
    setError(null);
    try {
      const updated = await updateAutomation(id, { executionLevel });
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.updateFailed);
    } finally {
      setUpdatingId(null);
    }
  };

  if (automations.length === 0) return null;

  return (
    <section aria-labelledby="request-scope-settings-heading" className="space-y-4">
      <div>
        <h2 id="request-scope-settings-heading" className="text-title text-foreground">
          {ui.requestScope.settingsTitle}
        </h2>
        <p className="mt-1 text-caption text-[var(--foreground-muted)]">
          {ui.requestScope.settingsHint}
        </p>
      </div>

      {error && <ErrorState message={error} />}

      <Card padding="lg" className="shadow-[var(--shadow-soft)]">
        <ul className="divide-y divide-[var(--border-subtle)]">
          {automations.map((automation) => (
            <li
              key={automation.id}
              className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-medium text-foreground">{automation.name}</p>
                <p className="text-caption text-[var(--foreground-muted)]">
                  {ui.requestScope.currentLabel}:{" "}
                  {getExecutionLevelShortLabel(automation.executionLevel)}
                </p>
              </div>
              <ExecutionLevelSelector
                compact
                value={automation.executionLevel}
                disabled={updatingId === automation.id}
                onChange={(level) => void handleChange(automation.id, level)}
              />
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
