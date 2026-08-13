import { detectInstructionConflicts } from "@/lib/automation-platform/instruction/conflict";
import { computeNextRunIsoFromTrigger } from "@/lib/automation-platform/schedule/compute";
import { getCapability } from "@/lib/automation-platform/step-registry/registry";
import type {
  AutomationTrigger,
  AutomationWorkflowStep,
  CreateAutomationV2Input,
} from "@/lib/automation-platform/types";
import { DEFAULT_AUTOMATION_PLATFORM_TIMEZONE } from "@/lib/automation-platform/schedule/timezone";
import {
  assertExternalsSatisfiedBySteps,
  ensureRequiredExternalSteps,
} from "@/lib/automations/ensure-external-steps";

import { buildHumanSummary, describeSchedule } from "./schedule-copy";
import type {
  AutomationWizardDraft,
  BuiltWizardPayload,
  WizardFieldError,
  WizardStepDraft,
  WizardStepId,
} from "./types";
import type { WorkCategoryId } from "./categories";

export function createEmptyWizardDraft(
  partial?: Partial<AutomationWizardDraft>,
): AutomationWizardDraft {
  return {
    draftId: crypto.randomUUID(),
    name: "",
    description: "",
    categoryIds: [],
    naturalLanguageSeed: "",
    steps: [],
    triggerType: "schedule",
    frequency: "weekly",
    timezone: DEFAULT_AUTOMATION_PLATFORM_TIMEZONE,
    hour: 18,
    minute: 0,
    daysOfWeek: [5],
    dayOfMonth: 1,
    runAt: null,
    startAt: null,
    endAt: null,
    executionMode: "review_before_run",
    selectedApprovalStepIds: [],
    notifyBeforeRun: false,
    notifyOnSuccess: true,
    notifyOnFailure: true,
    notifyOnNeedsInput: true,
    notificationChannels: ["in_app"],
    memoryEnabled: true,
    memoryAllowedScopes: [
      "writing_style",
      "document_design",
      "preferred_formats",
      "preferred_templates",
      "notification_preferences",
      "timezone",
      "locale",
      "naming_conventions",
      "recurring_work_preferences",
    ],
    memoryDeniedScopes: [],
    memoryLockedOverrides: {},
    freeformNotes: "",
    structuredExtras: {},
    conflictResolution: null,
    activateOnCreate: false,
    currentStepId: "work",
    savedAt: null,
    createdAutomationId: null,
    ...partial,
  };
}

export function createStepFromCapability(
  capabilityId: WizardStepDraft["type"],
): WizardStepDraft {
  const capability = getCapability(capabilityId);
  return {
    id: crypto.randomUUID(),
    type: capabilityId,
    name: capability?.name ?? capabilityId,
    enabled: true,
    requiresApproval: Boolean(capability?.systemRequiresApproval),
    configuration: {},
  };
}

export function reorderSteps(
  steps: WizardStepDraft[],
  fromIndex: number,
  toIndex: number,
): WizardStepDraft[] {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= steps.length ||
    toIndex >= steps.length
  ) {
    return steps;
  }
  const next = [...steps];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

function buildTrigger(draft: AutomationWizardDraft): AutomationTrigger {
  if (draft.triggerType === "manual") {
    return {
      type: "manual",
      timezone: draft.timezone,
      schedule: null,
      event: null,
      condition: null,
    };
  }

  return {
    type: "schedule",
    timezone: draft.timezone,
    schedule: {
      frequency: draft.frequency,
      hour: draft.hour,
      minute: draft.minute,
      daysOfWeek:
        draft.frequency === "weekly" || draft.frequency === "custom_days"
          ? draft.daysOfWeek
          : undefined,
      dayOfMonth: draft.frequency === "monthly" ? draft.dayOfMonth : undefined,
      runAt: draft.frequency === "once" ? draft.runAt : null,
      startAt: draft.startAt,
      endAt: draft.endAt,
      maxOccurrences: null,
    },
    event: null,
    condition: null,
  };
}

function buildWorkflowSteps(draft: AutomationWizardDraft): AutomationWorkflowStep[] {
  return draft.steps.map((step, index) => ({
    id: step.id,
    type: step.type,
    name: step.name,
    order: index + 1,
    inputBindings: {},
    configuration: step.configuration,
    requiresApproval: step.requiresApproval,
    retryPolicy: { maxAttempts: 3, backoffMs: [60_000, 300_000, 900_000] },
    timeoutMs: 120_000,
    onSuccess: null,
    onFailure: null,
    enabled: step.enabled,
  }));
}

export function validateWizardDraft(
  draft: AutomationWizardDraft,
): WizardFieldError[] {
  const errors: WizardFieldError[] = [];

  if (!draft.name.trim()) {
    errors.push({
      code: "name_required",
      message: "自動化の名前を入力してください",
      stepId: "review",
      field: "name",
    });
  }

  if (draft.steps.filter((s) => s.enabled).length === 0) {
    errors.push({
      code: "steps_required",
      message: "やることを1つ以上追加してください",
      stepId: "steps",
    });
  }

  if (draft.triggerType === "schedule") {
    if (draft.frequency === "once" && !draft.runAt) {
      errors.push({
        code: "run_at_required",
        message: "実行する日時を指定してください",
        stepId: "timing",
        field: "runAt",
      });
    }
    if (
      (draft.frequency === "weekly" || draft.frequency === "custom_days") &&
      draft.daysOfWeek.length === 0
    ) {
      errors.push({
        code: "days_required",
        message: "曜日を選んでください",
        stepId: "timing",
        field: "daysOfWeek",
      });
    }
  }

  if (draft.notificationChannels.length === 0) {
    errors.push({
      code: "channel_required",
      message: "通知方法を1つ以上選ぶか、通知オフでも履歴で確認できることを確認してください",
      stepId: "notifications",
    });
  }

  const instruction = {
    structuredOptions: {
      ...draft.structuredExtras,
      generatePdf: draft.steps.some((s) => s.type === "pdf_generate" && s.enabled),
      generateExcel: draft.steps.some((s) => s.type === "excel_generate" && s.enabled),
      generateWord: draft.steps.some((s) => s.type === "word_generate" && s.enabled),
      postToX: draft.steps.some((s) => s.type === "x_post" && s.enabled),
      sendEmail: draft.steps.some(
        (s) =>
          s.type === "gmail" &&
          s.enabled &&
          s.configuration.mode === "send",
      ),
    },
    freeformNotes: draft.freeformNotes,
  };
  const conflicts = detectInstructionConflicts(instruction);
  if (conflicts.length > 0 && !draft.conflictResolution) {
    errors.push({
      code: "instruction_conflict",
      message: "設定と備考に違いがあります。どちらを優先するか選んでください",
      stepId: "notes",
    });
  }

  return errors;
}

export function applyConflictResolution(
  draft: AutomationWizardDraft,
): AutomationWizardDraft {
  if (!draft.conflictResolution) return draft;
  const next = { ...draft, steps: draft.steps.map((s) => ({ ...s })) };

  if (draft.conflictResolution === "prefer_notes") {
    if (/PDF[はを]?不要/i.test(draft.freeformNotes)) {
      next.steps = next.steps.map((s) =>
        s.type === "pdf_generate" ? { ...s, enabled: false } : s,
      );
    }
    if (/Excel[はを]?不要|エクセル[はを]?不要/i.test(draft.freeformNotes)) {
      next.steps = next.steps.map((s) =>
        s.type === "excel_generate" ? { ...s, enabled: false } : s,
      );
    }
    if (/投稿し?ない|投稿不要|Xは不要/i.test(draft.freeformNotes)) {
      next.steps = next.steps.map((s) =>
        s.type === "x_post" ? { ...s, enabled: false } : s,
      );
    }
    if (/送らず|下書きだけ|送信しない/i.test(draft.freeformNotes)) {
      next.steps = next.steps.map((s) =>
        s.type === "gmail"
          ? { ...s, configuration: { ...s.configuration, mode: "draft" } }
          : s,
      );
    }
  }

  return next;
}

export function buildCreateInputFromWizard(
  draft: AutomationWizardDraft,
): BuiltWizardPayload {
  const resolved = applyConflictResolution(draft);
  const errors = validateWizardDraft(resolved);
  const structuredOptions = {
    ...resolved.structuredExtras,
    categories: resolved.categoryIds,
    generatePdf: resolved.steps.some((s) => s.type === "pdf_generate" && s.enabled),
    generateExcel: resolved.steps.some(
      (s) => s.type === "excel_generate" && s.enabled,
    ),
    generateWord: resolved.steps.some((s) => s.type === "word_generate" && s.enabled),
    postToX: resolved.steps.some((s) => s.type === "x_post" && s.enabled),
    conflictResolution: resolved.conflictResolution,
  };

  let freeformNotes = resolved.freeformNotes;
  if (resolved.conflictResolution === "prefer_structured") {
    freeformNotes = `${freeformNotes}\n（確認済み: 設定項目を優先）`.trim();
  }

  // Production incident aaef8557…: freeformNotes required Calendar but
  // draft.steps stayed orchestrate-only → run fail-closed at step-missing.
  const ensured = ensureRequiredExternalSteps({
    steps: buildWorkflowSteps(resolved),
    freeformNotes,
    structuredOptions,
    sourceText: resolved.naturalLanguageSeed || freeformNotes,
  });
  const externalGate = assertExternalsSatisfiedBySteps({
    required: ensured.required,
    steps: ensured.steps,
  });
  if (!externalGate.ok) {
    errors.push({
      code: "external_step_missing",
      message: externalGate.reason,
      stepId: "steps",
    });
  }

  const instruction = {
    structuredOptions: ensured.structuredOptions,
    freeformNotes,
  };
  const conflicts = detectInstructionConflicts(instruction);
  const trigger = buildTrigger(resolved);
  const nextRunAt =
    resolved.triggerType === "schedule" && resolved.activateOnCreate
      ? computeNextRunIsoFromTrigger(trigger)
      : null;

  const input: CreateAutomationV2Input = {
    name: resolved.name.trim() || "名称未設定の自動化",
    description: resolved.description.trim() || buildHumanSummary(resolved).slice(0, 240),
    status: resolved.activateOnCreate ? "active" : "draft",
    trigger,
    workflow: {
      version: 1,
      steps: ensured.steps,
      onFailure: { strategy: "stop", notify: true },
      timeoutPolicy: {
        workflowTimeoutMs: 900_000,
        stepDefaultTimeoutMs: 120_000,
      },
    },
    executionPolicy: {
      mode: resolved.executionMode,
      approvalTimeoutMs: null,
      onApprovalTimeout: "cancel",
      selectedStepIds: resolved.selectedApprovalStepIds,
      systemHighRiskOverride: true,
    },
    notificationPolicy: {
      beforeRun: resolved.notifyBeforeRun,
      onSuccess: resolved.notifyOnSuccess,
      onFailure: resolved.notifyOnFailure,
      onNeedsInput: resolved.notifyOnNeedsInput,
      channels: resolved.notificationChannels,
    },
    instruction,
    memoryPolicy: {
      enabled: resolved.memoryEnabled,
      allowedScopes: resolved.memoryEnabled
        ? resolved.memoryAllowedScopes.length > 0
          ? resolved.memoryAllowedScopes
          : [
              "writing_style",
              "document_design",
              "preferred_formats",
              "preferred_templates",
              "notification_preferences",
              "timezone",
              "locale",
              "naming_conventions",
              "recurring_work_preferences",
            ]
        : [],
      deniedScopes: resolved.memoryEnabled
        ? resolved.memoryDeniedScopes
        : [
            "writing_style",
            "document_design",
            "preferred_formats",
            "preferred_templates",
            "notification_preferences",
            "timezone",
            "locale",
            "naming_conventions",
            "recurring_work_preferences",
          ],
      lockedOverrides: resolved.memoryLockedOverrides,
    },
    rejectOnConflict: false,
  };

  return {
    input,
    summary: buildHumanSummary(resolved),
    nextRunLabel: nextRunAt
      ? new Date(nextRunAt).toLocaleString("ja-JP", {
          timeZone: resolved.timezone,
        })
      : describeSchedule(resolved),
    errors,
    conflicts,
  };
}

export function visibleWizardSteps(draft: AutomationWizardDraft): WizardStepId[] {
  const steps: WizardStepId[] = ["work", "timing", "steps"];
  if (draft.steps.some((s) => getCapability(s.type))) {
    steps.push("details");
  }
  steps.push("approval", "notifications");
  if (draft.memoryEnabled || draft.categoryIds.length > 0) {
    steps.push("memory");
  }
  steps.push("notes", "review");
  if (draft.createdAutomationId) {
    steps.push("complete");
  }
  return steps;
}

export function ensureNameFromCategories(draft: AutomationWizardDraft): string {
  if (draft.name.trim()) return draft.name;
  if (draft.categoryIds.length === 0) return "";
  const labels: Record<WorkCategoryId, string> = {
    document: "文書作成",
    spreadsheet: "データまとめ",
    vision: "書類読み取り",
    convert: "ファイル変換",
    email: "メール作業",
    sns: "SNS投稿",
    calendar: "カレンダー登録",
    storage: "ファイル保存",
    blog: "ブログ投稿",
    notify: "通知",
    combine: "組み合わせ作業",
  };
  return `${labels[draft.categoryIds[0]] ?? "仕事"}の自動化`;
}
