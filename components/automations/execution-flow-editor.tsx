"use client";

import type { WorkExecutionFlow, WorkflowTemplateId } from "@/lib/automations/types";
import {
  setExecutionFlowTemplate,
  toggleExecutionFlowStep,
} from "@/lib/automations/execution-flow";
import {
  getStepDefinition,
  isExternalIntegration,
  WORKFLOW_TEMPLATE_LIST,
} from "@/lib/automations/workflow-templates";
import {
  isWorkflowTemplateAvailableFromMap,
  useFeatureAvailability,
} from "@/lib/feature-flags";
import { ui } from "@/lib/i18n";

type ExecutionFlowEditorProps = {
  value: WorkExecutionFlow;
  onChange: (flow: WorkExecutionFlow) => void;
  disabled?: boolean;
};

export function ExecutionFlowEditor({
  value,
  onChange,
  disabled = false,
}: ExecutionFlowEditorProps) {
  const { flags } = useFeatureAvailability();

  const availableTemplates = WORKFLOW_TEMPLATE_LIST.filter((template) =>
    isWorkflowTemplateAvailableFromMap(template.id, flags),
  );

  const handleTemplateChange = (templateId: WorkflowTemplateId) => {
    onChange(setExecutionFlowTemplate(templateId));
  };

  const handleToggle = (stepId: string, enabled: boolean) => {
    onChange(toggleExecutionFlowStep(value, stepId, enabled));
  };

  return (
    <fieldset disabled={disabled} className="space-y-4">
      <legend className="text-sm font-medium text-foreground">
        {ui.executionFlow.fieldLabel}
      </legend>
      <p className="text-caption text-[var(--foreground-muted)]">
        {ui.executionFlow.fieldHint}
      </p>

      <div>
        <label className="mb-2 block text-sm text-[var(--foreground-muted)]">
          {ui.executionFlow.templateLabel}
        </label>
        <select
          value={value.templateId}
          onChange={(event) =>
            handleTemplateChange(event.target.value as WorkflowTemplateId)
          }
          className="h-11 w-full rounded-[var(--radius-lg)] bg-[var(--background-subtle)] px-4 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent/25"
        >
          {availableTemplates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.label}
            </option>
          ))}
        </select>
      </div>

      <ul className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--background-subtle)] p-4">
        {value.steps.map((step, index) => {
          const definition = getStepDefinition(value.templateId, step.id);
          const label = definition?.label ?? step.id;
          const integration = definition?.integration ?? "atlas";
          const isExternal = isExternalIntegration(integration);

          return (
            <li key={step.id}>
              <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] px-2 py-2 hover:bg-white/60">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-[var(--border-subtle)] text-accent focus:ring-accent/25"
                  checked={step.enabled}
                  onChange={(event) =>
                    handleToggle(step.id, event.target.checked)
                  }
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">
                    {index + 1}. {label}
                  </span>
                  {isExternal && (
                    <span className="mt-0.5 block text-caption text-[var(--foreground-muted)]">
                      {ui.executionFlow.externalStepHint}
                    </span>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
