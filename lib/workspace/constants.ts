import type { WorkflowPhaseState } from "./types";
import { ui } from "@/lib/i18n";

/**
 * User-facing wait steps only — no CEO / Planner / QA / pipeline jargon.
 * Kept short so first-time users always know what is happening.
 */
const SECRETARY_PHASES = [
  {
    id: "understand",
    label: ui.secretaryProgress.understand,
    subtitle: ui.secretaryProgress.understandHint,
  },
  {
    id: "write",
    label: ui.secretaryProgress.write,
    subtitle: ui.secretaryProgress.writeHint,
  },
  {
    id: "polish",
    label: ui.secretaryProgress.polish,
    subtitle: ui.secretaryProgress.polishHint,
  },
  {
    id: "done",
    label: ui.secretaryProgress.done,
    subtitle: ui.secretaryProgress.doneHint,
  },
] as const;

/** @deprecated Internal parallel slot count — UI no longer exposes workers. */
export const DEFAULT_PARALLEL_WORKER_SLOTS = 4;

export const buildWorkflowPhaseTemplate: (
  workerCount?: number,
) => readonly { id: string; label: string; subtitle: string }[] = () => {
  return SECRETARY_PHASES;
};

/** Interval for advancing the visual running phase while awaiting /api/orchestrate. */
export const LOADING_STEP_INTERVAL_MS = 4500;

export function createInitialPhases(
  workerCount: number = DEFAULT_PARALLEL_WORKER_SLOTS,
): WorkflowPhaseState[] {
  return buildWorkflowPhaseTemplate(workerCount).map((phase) => ({
    ...phase,
    status: "waiting" as const,
  }));
}

export function buildLoadingPhases(
  activeIndex: number,
  workerCount: number = DEFAULT_PARALLEL_WORKER_SLOTS,
): WorkflowPhaseState[] {
  return buildWorkflowPhaseTemplate(workerCount).map((phase, index) => {
    if (index < activeIndex) {
      return { ...phase, status: "completed" as const };
    }
    if (index === activeIndex) {
      return { ...phase, status: "running" as const };
    }
    return { ...phase, status: "waiting" as const };
  });
}

/** @deprecated Use buildWorkflowPhaseTemplate — kept for imports. */
export const BASE_WORKFLOW_PHASES = buildWorkflowPhaseTemplate();
