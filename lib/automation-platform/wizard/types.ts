import type {
  AutomationCapabilityId,
  AutomationMemoryScope,
  CreateAutomationV2Input,
  ExecutionPolicyMode,
  NotificationChannel,
  ScheduleFrequency,
} from "@/lib/automation-platform/types";
import type { WorkCategoryId } from "./categories";

/** Transient wizard state — always serializes to CreateAutomationV2Input. */
export type WizardStepId =
  | "work"
  | "timing"
  | "steps"
  | "details"
  | "approval"
  | "notifications"
  | "memory"
  | "notes"
  | "review"
  | "complete";

export type WizardStepDraft = {
  id: string;
  type: AutomationCapabilityId;
  name: string;
  enabled: boolean;
  requiresApproval: boolean;
  configuration: Record<string, unknown>;
};

export type WizardConflictResolution = "prefer_structured" | "prefer_notes" | null;

export type AutomationWizardDraft = {
  draftId: string;
  name: string;
  description: string;
  categoryIds: WorkCategoryId[];
  naturalLanguageSeed: string;
  steps: WizardStepDraft[];
  triggerType: "manual" | "schedule";
  frequency: ScheduleFrequency;
  timezone: string;
  hour: number;
  minute: number;
  daysOfWeek: number[];
  dayOfMonth: number;
  runAt: string | null;
  startAt: string | null;
  endAt: string | null;
  executionMode: ExecutionPolicyMode;
  selectedApprovalStepIds: string[];
  notifyBeforeRun: boolean;
  notifyOnSuccess: boolean;
  notifyOnFailure: boolean;
  notifyOnNeedsInput: boolean;
  notificationChannels: NotificationChannel[];
  memoryEnabled: boolean;
  memoryAllowedScopes: AutomationMemoryScope[];
  memoryDeniedScopes: AutomationMemoryScope[];
  memoryLockedOverrides: Record<string, unknown>;
  freeformNotes: string;
  structuredExtras: Record<string, unknown>;
  conflictResolution: WizardConflictResolution;
  activateOnCreate: boolean;
  currentStepId: WizardStepId;
  savedAt: string | null;
  createdAutomationId: string | null;
};

export type WizardFieldError = {
  code: string;
  message: string;
  stepId: WizardStepId;
  field?: string;
};

export type BuiltWizardPayload = {
  input: CreateAutomationV2Input;
  summary: string;
  nextRunLabel: string | null;
  errors: WizardFieldError[];
  conflicts: ReturnType<
    typeof import("@/lib/automation-platform/instruction/conflict").detectInstructionConflicts
  >;
};
