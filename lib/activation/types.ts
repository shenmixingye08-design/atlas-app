/** First-user Activation — weekly sales report Word path. */

export type ActivationStepId =
  | "choose"
  | "configure"
  | "run"
  | "receive";

export type ActivationPhase =
  | "idle"
  | "creating"
  | "running"
  | "succeeded"
  | "failed";

export type WeeklyReportConfig = {
  name: string;
  dayOfWeek: number; // 0=Sun … 6=Sat (JS); template uses 1=Mon
  hour: number;
  minute: number;
  contentNotes: string;
};

export type ActivationFailureInfo = {
  stage: "create" | "run" | "deliverable" | "storage" | "unknown";
  message: string;
  userCanFix: boolean;
  diagnosticId: string | null;
  retryable: boolean;
};

export type ActivationResult = {
  automationId: string;
  runId: string;
  diagnosticId: string | null;
  fileName: string;
  downloadUrl: string;
  formatLabel: "Word";
  createdAt: string;
  nextRunAt: string | null;
  durationMs: number;
};

export type ActivationProgressState = {
  version: 1;
  templateId: "weekly_sales_report_word";
  startedAt: string | null;
  completedAt: string | null;
  skippedAt: string | null;
  automationId: string | null;
  runId: string | null;
  artifactUrl: string | null;
  stepsCompleted: number;
  retryCount: number;
};

export const ACTIVATION_STEPS: readonly {
  id: ActivationStepId;
  index: number;
  label: string;
}[] = [
  { id: "choose", index: 1, label: "仕事を選ぶ" },
  { id: "configure", index: 2, label: "内容を設定" },
  { id: "run", index: 3, label: "試しに実行" },
  { id: "receive", index: 4, label: "成果物を受け取る" },
] as const;
