/**
 * Client-safe re-export of vision phase helpers (no server-only).
 * Keep in sync with job-phase.ts labels / step order.
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

export const VISION_PIPELINE_STEPS = [
  "image_received",
  "preprocessing",
  "analyzing",
  "artifact_generating",
  "completed",
] as const;

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

const ALL_PHASES = Object.keys(PHASE_LABEL_JA) as VisionJobPhase[];

export function isVisionJobPhase(value: unknown): value is VisionJobPhase {
  return typeof value === "string" && ALL_PHASES.includes(value as VisionJobPhase);
}

export function visionPhaseLabel(phase: string | null | undefined): string {
  if (!phase) return "準備中";
  if (isVisionJobPhase(phase)) return PHASE_LABEL_JA[phase];
  return phase;
}

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
