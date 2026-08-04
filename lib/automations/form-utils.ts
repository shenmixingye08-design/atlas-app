import type {
  Automation,
  AutomationDestination,
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
  inferWorkflowTemplate,
  normalizeExecutionFlow,
} from "./execution-flow";
import { DEFAULT_AUTOMATION_TIMEZONE, presetToCron } from "./schedule";
import { DEFAULT_AUTOMATION_TIMING } from "./timing-defaults";
import {
  buildXDestinationExecutionFlow,
  normalizeAutomationDestination,
} from "./x-recurring/destination";

export type FrequencyOption =
  | "daily"
  | "weekly"
  | "monthly"
  | "weekday"
  | "custom";

export type AutomationFormState = {
  title: string;
  assignment: string;
  description: string;
  destination: AutomationDestination;
  frequency: FrequencyOption;
  dayOfWeek: number;
  dayOfMonth: number;
  hour: number;
  minute: number;
  timezone: string;
  customCron: string;
  startDate: string;
  endType: AutomationEndCondition["type"];
  endDate: string;
  maxOccurrences: number;
  executionLevel: AutomationExecutionLevel;
  executionMode: AutomationExecutionMode;
  snsBatchDays: SnsBatchDays | null;
  executionFlow: WorkExecutionFlow;
  enabled: boolean;
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
  const base: AutomationFormState = {
    title: "",
    assignment: "",
    description: "",
    destination: "none",
    frequency: "weekly",
    dayOfWeek: 1,
    dayOfMonth: 1,
    hour: 9,
    minute: 0,
    timezone: DEFAULT_AUTOMATION_TIMEZONE,
    customCron: "0 9 * * 1-5",
    startDate: "",
    endType: "never",
    endDate: "",
    maxOccurrences: 12,
    executionLevel: DEFAULT_EXECUTION_LEVEL,
    executionMode: DEFAULT_EXECUTION_MODE,
    snsBatchDays: null,
    executionFlow: createDefaultExecutionFlow(),
    enabled: true,
    ...partial,
  };

  if (base.destination === "x" && (!partial?.executionFlow || partial.destination === "x")) {
    base.executionFlow = buildXDestinationExecutionFlow(base.executionLevel);
  }

  return base;
}

export function buildScheduleLabel(state: AutomationFormState): string {
  const time = `${String(state.hour).padStart(2, "0")}:${String(state.minute).padStart(2, "0")}`;
  switch (state.frequency) {
    case "daily":
      return `毎日 ${time}`;
    case "weekly":
      return `毎週${WEEKDAY_LABELS[state.dayOfWeek]} ${time}`;
    case "weekday":
      return `曜日指定（${WEEKDAY_LABELS[state.dayOfWeek]}） ${time}`;
    case "monthly":
      return `毎月${state.dayOfMonth}日 ${time}`;
    case "custom":
      return `カスタム（${state.customCron.trim() || "cron"}）`;
  }
}

export function buildSchedulePreset(state: AutomationFormState): SchedulePreset {
  switch (state.frequency) {
    case "daily":
      return { type: "daily", hour: state.hour, minute: state.minute };
    case "weekly":
    case "weekday":
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
    case "custom":
      // Custom cron still needs a concrete next-run preset; use daily time fields.
      return { type: "daily", hour: state.hour, minute: state.minute };
  }
}

export function buildScheduleFromForm(state: AutomationFormState): AutomationSchedule {
  const preset = buildSchedulePreset(state);
  const cron =
    state.frequency === "custom" && state.customCron.trim()
      ? state.customCron.trim()
      : presetToCron(preset);
  return {
    kind: "schedule",
    preset,
    cron,
    timezone: state.timezone.trim() || DEFAULT_AUTOMATION_TIMEZONE,
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
  const destination = normalizeAutomationDestination(state.destination);
  const executionFlow =
    destination === "x"
      ? buildXDestinationExecutionFlow(state.executionLevel)
      : normalizeExecutionFlow(state.executionFlow);

  return {
    name: state.title.trim(),
    description: state.description.trim() || `${state.title.trim()}の定期業務`,
    schedule: buildScheduleFromForm(state),
    workflow: {
      assignment: state.assignment.trim(),
      metadata: {
        destination,
      },
    },
    timing: {
      startDate,
      endCondition: buildEndConditionFromForm(state),
    },
    executionLevel: state.executionLevel,
    executionMode: state.executionMode,
    snsBatchDays: state.snsBatchDays,
    executionFlow,
    destination,
    enabled: state.enabled,
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
    destination: automation.destination,
    enabled: automation.enabled,
  });
}

export function formStateFromCreateInput(
  input: CreateAutomationInput,
): AutomationFormState {
  const schedule = input.schedule;
  const destination = normalizeAutomationDestination(
    input.destination ??
      (input.workflow.metadata as { destination?: unknown } | undefined)
        ?.destination,
  );
  const base = defaultAutomationFormState({
    title: input.name,
    assignment: input.workflow.assignment,
    description: input.description,
    destination,
    enabled: input.enabled ?? true,
  });

  if (schedule.kind !== "schedule") return base;

  const preset = schedule.preset;
  const timing = input.timing ?? DEFAULT_AUTOMATION_TIMING;
  const label = schedule.label ?? "";
  const frequency: FrequencyOption =
    /曜日指定/.test(label) || /weekday/i.test(label)
      ? "weekday"
      : /カスタム/.test(label) || (schedule.cron && schedule.cron !== presetToCron(preset))
        ? "custom"
        : preset.type;

  return {
    ...base,
    frequency,
    dayOfWeek: preset.type === "weekly" ? preset.dayOfWeek : base.dayOfWeek,
    dayOfMonth: preset.type === "monthly" ? preset.dayOfMonth : base.dayOfMonth,
    hour: preset.hour,
    minute: preset.minute,
    timezone: schedule.timezone || DEFAULT_AUTOMATION_TIMEZONE,
    customCron: schedule.cron ?? base.customCron,
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
        (destination === "x"
          ? buildXDestinationExecutionFlow(
              input.executionLevel ?? DEFAULT_EXECUTION_LEVEL,
            )
          : createDefaultExecutionFlow(
              inferWorkflowTemplate(
                `${input.name} ${input.workflow.assignment}`,
              ),
            )),
    ),
    destination,
    enabled: input.enabled ?? true,
  };
}

export function syncExecutionFlowFromJobText(
  state: AutomationFormState,
): AutomationFormState {
  if (state.destination === "x") {
    return {
      ...state,
      executionFlow: buildXDestinationExecutionFlow(state.executionLevel),
    };
  }

  const templateId = inferWorkflowTemplate(
    `${state.title} ${state.assignment}`,
  ) as WorkflowTemplateId;

  if (state.executionFlow.templateId === templateId) {
    return state;
  }

  return {
    ...state,
    executionFlow: createDefaultExecutionFlow(templateId),
  };
}

export function formatNextRunDisplay(nextRun: string | null | undefined): string {
  if (!nextRun) return "未設定";
  const date = new Date(nextRun);
  if (Number.isNaN(date.getTime())) return "未設定";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: DEFAULT_AUTOMATION_TIMEZONE,
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
