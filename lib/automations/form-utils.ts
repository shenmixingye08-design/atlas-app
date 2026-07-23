import type {
  Automation,
  AutomationEndCondition,
  AutomationExecutionLevel,
  AutomationExecutionMode,
  AutomationSchedule,
  CreateAutomationInput,
  SchedulePreset,
  SnsBatchDays,
  WorkExecutionFlow,
  WorkflowTemplateId,
} from "./types";
import { DEFAULT_EXECUTION_LEVEL } from "./execution-level";
import { DEFAULT_EXECUTION_MODE } from "@/lib/cost-optimization/execution-mode";
import {
  createDefaultExecutionFlow,
  applyExternalPublishIntent,
  inferWorkflowTemplate,
  normalizeExecutionFlow,
} from "./execution-flow";
import { DEFAULT_AUTOMATION_TIMEZONE, presetToCron } from "./schedule";
import { DEFAULT_AUTOMATION_TIMING } from "./timing-defaults";

export type FrequencyOption = "daily" | "weekly" | "monthly";

export type AutomationFormState = {
  title: string;
  assignment: string;
  description: string;
  frequency: FrequencyOption;
  dayOfWeek: number;
  dayOfMonth: number;
  hour: number;
  minute: number;
  startDate: string;
  endType: AutomationEndCondition["type"];
  endDate: string;
  maxOccurrences: number;
  executionLevel: AutomationExecutionLevel;
  executionMode: AutomationExecutionMode;
  snsBatchDays: SnsBatchDays | null;
  executionFlow: WorkExecutionFlow;
};

export const WEEKDAY_LABELS = [
  "日曜",
  "月曜",
  "火曜",
  "水曜",
  "木曜",
  "金曜",
  "土曜",
] as const;

export function defaultAutomationFormState(
  partial?: Partial<AutomationFormState>,
): AutomationFormState {
  return {
    title: "",
    assignment: "",
    description: "",
    frequency: "weekly",
    dayOfWeek: 1,
    dayOfMonth: 1,
    hour: 9,
    minute: 0,
    startDate: "",
    endType: "never",
    endDate: "",
    maxOccurrences: 12,
    executionLevel: DEFAULT_EXECUTION_LEVEL,
    executionMode: DEFAULT_EXECUTION_MODE,
    snsBatchDays: null,
    executionFlow: createDefaultExecutionFlow(),
    ...partial,
  };
}

export function buildScheduleLabel(state: AutomationFormState): string {
  const time = `${String(state.hour).padStart(2, "0")}:${String(state.minute).padStart(2, "0")}`;
  switch (state.frequency) {
    case "daily":
      return `毎日 ${time}`;
    case "weekly":
      return `毎週${WEEKDAY_LABELS[state.dayOfWeek]} ${time}`;
    case "monthly":
      return `毎月${state.dayOfMonth}日 ${time}`;
  }
}

export function buildSchedulePreset(state: AutomationFormState): SchedulePreset {
  switch (state.frequency) {
    case "daily":
      return { type: "daily", hour: state.hour, minute: state.minute };
    case "weekly":
      return {
        type: "weekly",
        dayOfWeek: state.dayOfWeek,
        hour: state.hour,
        minute: state.minute,
      };
    case "monthly":
      return {
        type: "monthly",
        dayOfMonth: state.dayOfMonth,
        hour: state.hour,
        minute: state.minute,
      };
  }
}

export function buildScheduleFromForm(state: AutomationFormState): AutomationSchedule {
  const preset = buildSchedulePreset(state);
  return {
    kind: "schedule",
    preset,
    cron: presetToCron(preset),
    timezone: DEFAULT_AUTOMATION_TIMEZONE,
    label: buildScheduleLabel(state),
  };
}

export function buildEndConditionFromForm(
  state: AutomationFormState,
): AutomationEndCondition {
  if (state.endType === "until_date" && state.endDate.trim()) {
    const until = new Date(`${state.endDate}T23:59:59`);
    return { type: "until_date", until: until.toISOString() };
  }
  if (state.endType === "occurrence_count") {
    return {
      type: "occurrence_count",
      maxOccurrences: Math.max(1, state.maxOccurrences),
      completedOccurrences: 0,
    };
  }
  return { type: "never" };
}

export function buildCreateInputFromForm(
  state: AutomationFormState,
): CreateAutomationInput {
  const startDate = state.startDate.trim()
    ? new Date(`${state.startDate}T00:00:00`).toISOString()
    : null;

  return {
    name: state.title.trim(),
    description: state.description.trim() || `${state.title.trim()}の定期業務`,
    schedule: buildScheduleFromForm(state),
    workflow: {
      assignment: state.assignment.trim(),
    },
    timing: {
      startDate,
      endCondition: buildEndConditionFromForm(state),
    },
    executionLevel: state.executionLevel,
    executionMode: state.executionMode,
    snsBatchDays: state.snsBatchDays,
    executionFlow: applyExternalPublishIntent(
      normalizeExecutionFlow(state.executionFlow),
      `${state.title} ${state.assignment}`,
    ),
    enabled: true,
  };
}

export function formStateFromAutomation(automation: Automation): AutomationFormState {
  return formStateFromCreateInput({
    name: automation.name,
    description: automation.description,
    schedule: automation.schedule,
    workflow: automation.workflow,
    timing: automation.timing,
    executionLevel: automation.executionLevel,
    executionMode: automation.executionMode,
    snsBatchDays: automation.snsBatchDays,
    executionFlow: automation.executionFlow,
  });
}

export function formStateFromCreateInput(
  input: CreateAutomationInput,
): AutomationFormState {
  const schedule = input.schedule;
  const base = defaultAutomationFormState({
    title: input.name,
    assignment: input.workflow.assignment,
    description: input.description,
  });

  if (schedule.kind !== "schedule") return base;

  const preset = schedule.preset;
  const timing = input.timing ?? DEFAULT_AUTOMATION_TIMING;

  return {
    ...base,
    frequency: preset.type,
    dayOfWeek: preset.type === "weekly" ? preset.dayOfWeek : base.dayOfWeek,
    dayOfMonth: preset.type === "monthly" ? preset.dayOfMonth : base.dayOfMonth,
    hour: preset.hour,
    minute: preset.minute,
    startDate: timing.startDate
      ? new Date(timing.startDate).toISOString().slice(0, 10)
      : "",
    endType: timing.endCondition.type,
    endDate:
      timing.endCondition.type === "until_date"
        ? new Date(timing.endCondition.until).toISOString().slice(0, 10)
        : "",
    maxOccurrences:
      timing.endCondition.type === "occurrence_count"
        ? timing.endCondition.maxOccurrences
        : base.maxOccurrences,
    executionLevel: input.executionLevel ?? DEFAULT_EXECUTION_LEVEL,
    executionMode: input.executionMode ?? DEFAULT_EXECUTION_MODE,
    snsBatchDays: input.snsBatchDays ?? null,
    executionFlow: normalizeExecutionFlow(
      input.executionFlow ??
        createDefaultExecutionFlow(
          inferWorkflowTemplate(
            `${input.name} ${input.workflow.assignment}`,
          ),
        ),
    ),
  };
}

export function syncExecutionFlowFromJobText(
  state: AutomationFormState,
): AutomationFormState {
  const templateId = inferWorkflowTemplate(
    `${state.title} ${state.assignment}`,
  ) as WorkflowTemplateId;

  const baseFlow =
    state.executionFlow.templateId === templateId
      ? state.executionFlow
      : createDefaultExecutionFlow(templateId);

  return {
    ...state,
    executionFlow: applyExternalPublishIntent(
      normalizeExecutionFlow(baseFlow),
      `${state.title} ${state.assignment}`,
    ),
  };
}
