import type { OrchestrationStep } from "@/lib/orchestration/types";

/** User-facing progress family (not internal AI names). */
export type UserProgressKind =
  | "sales_material"
  | "blog"
  | "receipt"
  | "excel"
  | "pdf"
  | "sns"
  | "generic";

export type UserProgressStepStatus = "pending" | "current" | "completed";

export type UserProgressStepDef = {
  id: string;
  /** Short label for the step list. */
  label: string;
  /** Emphasized line while this step is current. */
  activeLabel: string;
  icon: string;
};

export type UserProgressStepView = UserProgressStepDef & {
  status: UserProgressStepStatus;
};

export type UserProgressPhase =
  | "orchestrating"
  | "file_generating"
  | "completed"
  | "failed";

export type UserProgressSnapshot = {
  sessionId: string;
  kind: UserProgressKind;
  phase: UserProgressPhase;
  /** Latest internal orchestration step (for sync; never shown raw). */
  orchestrationStep: OrchestrationStep | null;
  activeStepIndex: number;
  steps: readonly UserProgressStepView[];
  progressPercent: number;
  headline: string;
  updatedAt: string;
};

export type UserProgressSessionRecord = {
  sessionId: string;
  userId: string;
  kind: UserProgressKind;
  phase: UserProgressPhase;
  orchestrationStep: OrchestrationStep | null;
  /** Highest orchestration-mapped step index reached (monotonic). */
  orchestrationStepIndex: number;
  fileGenerating: boolean;
  failed: boolean;
  completed: boolean;
  updatedAt: string;
};
