/** User-facing step labels — not raw technical logs. */

export const JOB_STEP_LABELS: Record<string, string> = {
  orchestrate: "内容を作成",
  deliverables: "PDFを生成",
  upload: "ファイルを保存",
  x_post: "Xに投稿",
  review: "内容を確認",
  finalize: "仕上げ",
};

export function resolveJobStepLabel(stepId: string): string {
  return JOB_STEP_LABELS[stepId] ?? stepId;
}

export function buildStepEvidence(
  stepId: string,
  status: "pending" | "running" | "completed" | "failed",
): { id: string; label: string; status: typeof status; at: string } {
  return {
    id: stepId,
    label: resolveJobStepLabel(stepId),
    status,
    at: new Date().toISOString(),
  };
}
