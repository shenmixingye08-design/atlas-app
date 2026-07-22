import type { AutomationExecutionLevel, AutomationExecutionMode } from "./types";
import type { ScheduleKind } from "./schedule-display";
import {
  buildCreateInputFromForm,
  defaultAutomationFormState,
  type AutomationFormState,
  type FrequencyOption,
} from "./form-utils";
import { DEFAULT_EXECUTION_LEVEL } from "./execution-level";
import { DEFAULT_EXECUTION_MODE } from "@/lib/cost-optimization/execution-mode";
import { createDefaultExecutionFlow } from "./execution-flow";
import type { WorkflowTemplateId } from "./types";

export type AutomationWizardStep =
  | "work"
  | "schedule"
  | "output"
  | "notifications"
  | "confirm";

export const WIZARD_STEPS: AutomationWizardStep[] = [
  "work",
  "schedule",
  "output",
  "notifications",
  "confirm",
];

export type OutputFormatSelection = "pdf" | "docx" | "xlsx" | "html";

export type NotificationPrefs = {
  onSuccess: boolean;
  onFailure: boolean;
  onApproval: boolean;
  onDisconnect: boolean;
  onArtifact: boolean;
  onStart: boolean;
  onTransient: boolean;
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  onSuccess: true,
  onFailure: true,
  onApproval: true,
  onDisconnect: true,
  onArtifact: true,
  onStart: false,
  onTransient: false,
};

export type FailureMode = "retry_3" | "retry_1" | "notify_only";

export type AutomationWizardState = {
  step: AutomationWizardStep;
  title: string;
  assignment: string;
  description: string;
  scheduleKind: ScheduleKind;
  frequency: FrequencyOption;
  dayOfWeek: number;
  dayOfMonth: number;
  hour: number;
  minute: number;
  onceAt: string;
  startDate: string;
  endType: AutomationFormState["endType"];
  endDate: string;
  maxOccurrences: number;
  executionLevel: AutomationExecutionLevel;
  executionMode: AutomationExecutionMode;
  outputFormats: OutputFormatSelection[];
  templateId: WorkflowTemplateId;
  notificationPrefs: NotificationPrefs;
  failureMode: FailureMode;
  testLivePublish: boolean;
  requiredConnections: string[];
  updatedAt: string;
};

export function defaultWizardState(
  partial?: Partial<AutomationWizardState>,
): AutomationWizardState {
  const baseForm = defaultAutomationFormState();
  return {
    step: "work",
    title: "",
    assignment: "",
    description: "",
    scheduleKind: "weekly",
    frequency: baseForm.frequency,
    dayOfWeek: baseForm.dayOfWeek,
    dayOfMonth: baseForm.dayOfMonth,
    hour: baseForm.hour,
    minute: baseForm.minute,
    onceAt: "",
    startDate: "",
    endType: "never",
    endDate: "",
    maxOccurrences: 12,
    executionLevel: DEFAULT_EXECUTION_LEVEL,
    executionMode: DEFAULT_EXECUTION_MODE,
    outputFormats: ["pdf"],
    templateId: "generic",
    notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS },
    failureMode: "retry_3",
    testLivePublish: false,
    requiredConnections: [],
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

export function wizardStateToFormState(
  wizard: AutomationWizardState,
): AutomationFormState {
  return defaultAutomationFormState({
    title: wizard.title,
    assignment: wizard.assignment,
    description: wizard.description,
    frequency: wizard.frequency,
    dayOfWeek: wizard.dayOfWeek,
    dayOfMonth: wizard.dayOfMonth,
    hour: wizard.hour,
    minute: wizard.minute,
    startDate: wizard.startDate,
    endType: wizard.endType,
    endDate: wizard.endDate,
    maxOccurrences: wizard.maxOccurrences,
    executionLevel: wizard.executionLevel,
    executionMode: wizard.executionMode,
    executionFlow: createDefaultExecutionFlow(wizard.templateId),
  });
}

export function wizardToCreateInput(wizard: AutomationWizardState) {
  const form = wizardStateToFormState(wizard);
  const input = buildCreateInputFromForm(form);
  return {
    ...input,
    workflow: {
      ...input.workflow,
      metadata: {
        outputFormats: wizard.outputFormats,
        notificationPrefs: wizard.notificationPrefs,
        failureMode: wizard.failureMode,
        scheduleKind: wizard.scheduleKind,
        onceAt: wizard.onceAt || undefined,
      },
    },
  };
}

export function wizardStepIndex(step: AutomationWizardStep): number {
  return WIZARD_STEPS.indexOf(step);
}

export function wizardStepLabel(step: AutomationWizardStep): string {
  switch (step) {
    case "work":
      return "仕事内容";
    case "schedule":
      return "実行日時";
    case "output":
      return "出力";
    case "notifications":
      return "通知・失敗";
    case "confirm":
      return "確認・テスト";
  }
}
