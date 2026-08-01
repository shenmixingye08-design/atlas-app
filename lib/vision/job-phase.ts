import "server-only";

/**
 * Vision pipeline phases for background jobs.
 * timeout failures use "failed" — never "needs_input".
 *
 * User-facing pipeline (Japanese labels via visionPhaseLabel):
 * 画像受信 → 画像補正 → AI解析 → 成果物生成 → 完成
 */
export type VisionJobPhase =
  | "queued"
  | "image_received"
  | "preprocessing"
  | "analyzing"
  | "retrying"
  | "artifact_generating"
  | "completed"
  | "needs_input"
  | "failed";

export const VISION_JOB_PHASES: readonly VisionJobPhase[] = [
  "queued",
  "image_received",
  "preprocessing",
  "analyzing",
  "retrying",
  "artifact_generating",
  "completed",
  "needs_input",
  "failed",
] as const;

/** Ordered steps shown in realtime UI (terminal states excluded). */
export const VISION_PIPELINE_STEPS = [
  "image_received",
  "preprocessing",
  "analyzing",
  "artifact_generating",
  "completed",
] as const satisfies readonly VisionJobPhase[];

export type VisionPipelineStep = (typeof VISION_PIPELINE_STEPS)[number];

const PHASE_LABEL_JA: Record<VisionJobPhase, string> = {
  queued: "受付済み",
  image_received: "画像受信",
  preprocessing: "画像補正",
  analyzing: "AI解析",
  retrying: "AI解析（再試行）",
  artifact_generating: "成果物生成",
  completed: "完成",
  needs_input: "追加確認が必要",
  failed: "失敗",
};

export function visionPhaseLabel(phase: string | null | undefined): string {
  if (!phase) return "準備中";
  if (isVisionJobPhase(phase)) return PHASE_LABEL_JA[phase];
  return phase;
}

export function isVisionJobPhase(value: unknown): value is VisionJobPhase {
  return (
    typeof value === "string" &&
    (VISION_JOB_PHASES as readonly string[]).includes(value)
  );
}

/** Map phase → pipeline step index for progress UI (0-based). */
export function visionPipelineStepIndex(phase: string | null | undefined): number {
  if (!phase) return 0;
  if (phase === "queued" || phase === "image_received") return 0;
  if (phase === "preprocessing") return 1;
  if (phase === "analyzing" || phase === "retrying") return 2;
  if (phase === "artifact_generating") return 3;
  if (phase === "completed") return 4;
  if (phase === "needs_input" || phase === "failed") return -1;
  return 0;
}

/** timeout must never be mapped to needs_input. */
export function visionPhaseForError(input: {
  code?: string | null;
  gateStatus?: string | null;
}): VisionJobPhase {
  if (input.code === "timeout") return "failed";
  if (input.gateStatus === "needs_input") return "needs_input";
  return "failed";
}

export type VisionAttemptHistoryEntry = {
  attempt: number;
  phase: VisionJobPhase;
  errorCode: string | null;
  errorMessage: string | null;
  openaiRequestId: string | null;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
};

export function appendAttemptHistory(
  existing: unknown,
  entry: VisionAttemptHistoryEntry,
): VisionAttemptHistoryEntry[] {
  const prev = Array.isArray(existing)
    ? existing.filter(
        (row): row is VisionAttemptHistoryEntry =>
          Boolean(row) &&
          typeof row === "object" &&
          typeof (row as { attempt?: unknown }).attempt === "number",
      )
    : [];
  return [...prev, entry];
}
