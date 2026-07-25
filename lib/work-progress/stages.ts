/**
 * User-facing 6-stage progress model for MINERVOT work runs.
 * Pure logic — no AI. Maps commander / reliability status onto a clear journey.
 */

export const WORK_PROGRESS_STAGES = [
  "accepted",
  "analyzing",
  "executing",
  "generating",
  "reviewing",
  "delivered",
] as const;

export type WorkProgressStageId = (typeof WORK_PROGRESS_STAGES)[number];

export type WorkProgressStageStatus = "done" | "current" | "upcoming" | "failed";

export type WorkProgressStageView = {
  id: WorkProgressStageId;
  label: string;
  status: WorkProgressStageStatus;
};

export const WORK_PROGRESS_STAGE_LABELS: Record<WorkProgressStageId, string> = {
  accepted: "依頼受付",
  analyzing: "分析中",
  executing: "実行中",
  generating: "成果物生成",
  reviewing: "最終確認",
  delivered: "納品完了",
};

export function stageIndex(stage: WorkProgressStageId): number {
  return WORK_PROGRESS_STAGES.indexOf(stage);
}

export function clampStage(stage: WorkProgressStageId | null | undefined): WorkProgressStageId {
  if (stage && WORK_PROGRESS_STAGES.includes(stage)) return stage;
  return "accepted";
}

/** Build the 6-stage list with current/done/upcoming/failed markers. */
export function buildStageViews(input: {
  current: WorkProgressStageId;
  failed?: boolean;
}): WorkProgressStageView[] {
  const current = clampStage(input.current);
  const currentIdx = stageIndex(current);

  return WORK_PROGRESS_STAGES.map((id, index) => {
    let status: WorkProgressStageStatus = "upcoming";
    if (input.failed && index === currentIdx) {
      status = "failed";
    } else if (index < currentIdx || (current === "delivered" && !input.failed)) {
      status = "done";
    } else if (index === currentIdx) {
      status = current === "delivered" ? "done" : "current";
    }
    return {
      id,
      label: WORK_PROGRESS_STAGE_LABELS[id],
      status,
    };
  });
}

/**
 * Estimate which stage we should show from elapsed time vs ETA.
 * Used for client-side progress while the blocking execute request is in flight.
 */
export function estimateStageFromElapsed(input: {
  elapsedMs: number;
  etaMs: number;
  completed?: boolean;
  failed?: boolean;
}): WorkProgressStageId {
  if (input.completed) return "delivered";
  if (input.failed) return "executing";

  const eta = Math.max(input.etaMs, 5_000);
  const ratio = Math.min(0.98, Math.max(0, input.elapsedMs / eta));

  if (ratio < 0.08) return "accepted";
  if (ratio < 0.22) return "analyzing";
  if (ratio < 0.55) return "executing";
  if (ratio < 0.8) return "generating";
  return "reviewing";
}

/** Map commander / reliability status onto a user stage. */
export function mapRunStatusToStage(input: {
  status: string;
  reliabilityStage?: WorkProgressStageId | null;
}): WorkProgressStageId {
  if (input.reliabilityStage) return clampStage(input.reliabilityStage);

  switch (input.status) {
    case "planning":
    case "queued":
      return "accepted";
    case "awaiting_confirmation":
      return "analyzing";
    case "running":
    case "retrying":
      return "executing";
    case "partial":
      return "generating";
    case "completed":
      return "delivered";
    case "failed":
    case "cancelled":
      return "executing";
    default:
      return "accepted";
  }
}
