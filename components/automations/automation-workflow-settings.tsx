"use client";

import { useState } from "react";

import type { Automation, WorkExecutionFlow } from "@/lib/automations/types";
import { updateAutomation } from "@/lib/automations/client";
import { normalizeExecutionFlow } from "@/lib/automations/execution-flow";
import { ui } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";

import { ExecutionFlowEditor } from "./execution-flow-editor";
import { ExecutionFlowSummary } from "./execution-flow-summary";

type AutomationWorkflowSettingsProps = {
  automations: Automation[];
  onUpdated: (automation: Automation) => void;
};

export function AutomationWorkflowSettings({
  automations,
  onUpdated,
}: AutomationWorkflowSettingsProps) {
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleChange = async (id: string, executionFlow: WorkExecutionFlow) => {
    setUpdatingId(id);
    setError(null);
    try {
      const updated = await updateAutomation(id, {
        executionFlow: normalizeExecutionFlow(executionFlow),
      });
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error.updateFailed);
    } finally {
      setUpdatingId(null);
    }
  };

  if (automations.length === 0) return null;

  return (
    <section aria-labelledby="execution-flow-settings-heading" className="space-y-4">
      <div>
        <h2 id="execution-flow-settings-heading" className="text-title text-foreground">
          {ui.executionFlow.settingsTitle}
        </h2>
        <p className="mt-1 text-caption text-[var(--foreground-muted)]">
          {ui.executionFlow.settingsHint}
        </p>
      </div>

      {error && <ErrorState message={error} />}

      <Card padding="lg" className="shadow-[var(--shadow-soft)]">
        <ul className="divide-y divide-[var(--border-subtle)]">
          {automations.map((automation) => {
            const isExpanded = expandedId === automation.id;
            const isUpdating = updatingId === automation.id;

            return (
              <li key={automation.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="font-medium text-foreground">{automation.name}</p>
                    <ExecutionFlowSummary flow={automation.executionFlow} compact />
                  </div>
                  <button
                    type="button"
                    className="shrink-0 text-sm font-medium text-accent hover:underline disabled:opacity-50"
                    disabled={isUpdating}
                    onClick={() =>
                      setExpandedId(isExpanded ? null : automation.id)
                    }
                  >
                    {isExpanded ? ui.executionFlow.collapseEdit : ui.executionFlow.expandEdit}
                  </button>
                </div>

                {isExpanded && (
                  <div className="mt-4 border-t border-[var(--border-subtle)] pt-4">
                    <ExecutionFlowEditor
                      value={automation.executionFlow}
                      disabled={isUpdating}
                      onChange={(flow) => void handleChange(automation.id, flow)}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}
