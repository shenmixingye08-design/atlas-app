/**
 * Production Job State Machine — illegal transitions are rejected.
 */

export const JOB_PIPELINE_STAGES = [
  "queued",
  "validating",
  "preprocessing",
  "analyzing",
  "generating",
  "converting",
  "uploading",
  "saving",
  "notifying",
  "completed",
] as const;

export const JOB_EXCEPTION_STAGES = [
  "failed",
  "needs_input",
  "retrying",
  "cancelled",
] as const;

export type JobPipelineStage =
  | (typeof JOB_PIPELINE_STAGES)[number]
  | (typeof JOB_EXCEPTION_STAGES)[number]
  /** Legacy coarse status kept for compatibility. */
  | "running"
  | "awaiting_confirmation";

export type JobStatusHistoryEntry = {
  from: JobPipelineStage | null;
  to: JobPipelineStage;
  at: string;
  reason?: string | null;
  workerId?: string | null;
};

/** Forward pipeline edges (and self for heartbeats). */
const FORWARD: Record<string, ReadonlySet<string>> = {
  queued: new Set([
    "validating",
    "running",
    "retrying",
    "cancelled",
    "failed",
  ]),
  validating: new Set([
    "preprocessing",
    "analyzing",
    "retrying",
    "failed",
    "needs_input",
    "cancelled",
    "running",
  ]),
  preprocessing: new Set([
    "analyzing",
    "generating",
    "retrying",
    "failed",
    "needs_input",
    "cancelled",
    "running",
  ]),
  analyzing: new Set([
    "generating",
    "retrying",
    "failed",
    "needs_input",
    "cancelled",
    "running",
  ]),
  generating: new Set([
    "converting",
    "uploading",
    "saving",
    "retrying",
    "failed",
    "needs_input",
    "cancelled",
    "running",
  ]),
  converting: new Set([
    "uploading",
    "saving",
    "retrying",
    "failed",
    "cancelled",
    "running",
  ]),
  uploading: new Set([
    "saving",
    "notifying",
    "retrying",
    "failed",
    "cancelled",
    "running",
  ]),
  saving: new Set([
    "notifying",
    "completed",
    "retrying",
    "failed",
    "cancelled",
    "running",
  ]),
  notifying: new Set(["completed", "failed", "cancelled", "running"]),
  running: new Set([
    "validating",
    "preprocessing",
    "analyzing",
    "generating",
    "converting",
    "uploading",
    "saving",
    "notifying",
    "completed",
    "failed",
    "needs_input",
    "retrying",
    "cancelled",
    "awaiting_confirmation",
    "running",
  ]),
  retrying: new Set([
    "queued",
    "validating",
    "preprocessing",
    "analyzing",
    "generating",
    "running",
    "failed",
    "cancelled",
  ]),
  needs_input: new Set(["queued", "validating", "cancelled", "failed"]),
  awaiting_confirmation: new Set([
    "queued",
    "validating",
    "cancelled",
    "failed",
    "needs_input",
  ]),
  completed: new Set([]),
  failed: new Set(["queued", "retrying", "cancelled"]),
  cancelled: new Set([]),
};

export function isTerminalJobStage(stage: JobPipelineStage): boolean {
  return (
    stage === "completed" ||
    stage === "failed" ||
    stage === "cancelled" ||
    stage === "needs_input" ||
    stage === "awaiting_confirmation"
  );
}

export function isInProgressJobStage(stage: JobPipelineStage): boolean {
  return (
    stage === "running" ||
    stage === "retrying" ||
    stage === "validating" ||
    stage === "preprocessing" ||
    stage === "analyzing" ||
    stage === "generating" ||
    stage === "converting" ||
    stage === "uploading" ||
    stage === "saving" ||
    stage === "notifying"
  );
}

export function canTransitionJobStage(
  from: JobPipelineStage,
  to: JobPipelineStage,
): boolean {
  if (from === to) return true;
  const allowed = FORWARD[from];
  if (!allowed) return false;
  return allowed.has(to);
}

export class IllegalJobTransitionError extends Error {
  readonly from: JobPipelineStage;
  readonly to: JobPipelineStage;

  constructor(from: JobPipelineStage, to: JobPipelineStage) {
    super(`illegal_job_transition:${from}->${to}`);
    this.name = "IllegalJobTransitionError";
    this.from = from;
    this.to = to;
  }
}

/**
 * Assert and return next stage. Throws on illegal transition.
 */
export function transitionJobStage(
  from: JobPipelineStage,
  to: JobPipelineStage,
): JobPipelineStage {
  if (!canTransitionJobStage(from, to)) {
    throw new IllegalJobTransitionError(from, to);
  }
  return to;
}

export function appendStatusHistory(
  history: JobStatusHistoryEntry[] | undefined,
  entry: JobStatusHistoryEntry,
  max = 64,
): JobStatusHistoryEntry[] {
  const next = [...(history ?? []), entry];
  return next.length > max ? next.slice(next.length - max) : next;
}

export function progressPercentForStage(stage: JobPipelineStage): number {
  const map: Partial<Record<JobPipelineStage, number>> = {
    queued: 0,
    validating: 8,
    preprocessing: 16,
    analyzing: 28,
    generating: 48,
    converting: 62,
    uploading: 74,
    saving: 86,
    notifying: 94,
    completed: 100,
    retrying: 20,
    needs_input: 50,
    awaiting_confirmation: 50,
    failed: 100,
    cancelled: 100,
    running: 30,
  };
  return map[stage] ?? 0;
}

export function labelForJobStage(stage: JobPipelineStage): string {
  const map: Record<JobPipelineStage, string> = {
    queued: "受付済み・待機中",
    validating: "依頼内容を確認しています",
    preprocessing: "前処理しています",
    analyzing: "内容を分析しています",
    generating: "成果物を生成しています",
    converting: "形式を変換しています",
    uploading: "ファイルをアップロードしています",
    saving: "保存しています",
    notifying: "完了通知を送っています",
    completed: "完了しました",
    failed: "失敗しました",
    needs_input: "追加の入力待ちです",
    retrying: "再試行しています",
    cancelled: "キャンセルされました",
    running: "処理中です",
    awaiting_confirmation: "確認待ちです",
  };
  return map[stage];
}

/** Map legacy coarse statuses into pipeline vocabulary. */
export function normalizeJobStage(status: string): JobPipelineStage {
  if (status === "awaiting_confirmation") return "needs_input";
  if (
    status === "queued" ||
    status === "validating" ||
    status === "preprocessing" ||
    status === "analyzing" ||
    status === "generating" ||
    status === "converting" ||
    status === "uploading" ||
    status === "saving" ||
    status === "notifying" ||
    status === "completed" ||
    status === "failed" ||
    status === "needs_input" ||
    status === "retrying" ||
    status === "cancelled" ||
    status === "running"
  ) {
    return status;
  }
  return "running";
}
