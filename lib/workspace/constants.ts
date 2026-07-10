import type { WorkflowPhaseState } from "./types";
import { ui } from "@/lib/i18n";

/** Default parallel worker slots shown during loading animation. */
export const DEFAULT_PARALLEL_WORKER_SLOTS = 4;

const CEO_PHASE = {
  id: "ceo",
  label: ui.workflowPhases.ceo,
  subtitle: "リクエストを分析",
} as const;

const RESEARCH_PHASE = {
  id: "research",
  label: ui.workflow.research,
  subtitle: "外部調査の要否を判定・実施",
} as const;

const PLANNER_PLAN_PHASE = {
  id: "planner-plan",
  label: ui.workflow.planning,
  subtitle: "実行計画を作成",
} as const;

const PLANNER_TASKS_PHASE = {
  id: "planner-tasks",
  label: ui.workflow.planning,
  subtitle: "タスクに分解",
} as const;

const REVIEWER_PHASE = {
  id: "reviewer",
  label: ui.workflow.review,
  subtitle: "制作結果を確認",
} as const;

const QA_PHASE = {
  id: "quality-assurance",
  label: ui.workflow.qa,
  subtitle: "品質スコアリング（0–100）",
} as const;

const CEO_APPROVAL_PHASE = {
  id: "ceo-approval",
  label: ui.workflow.ceo,
  subtitle: "最終承認",
} as const;

const FINAL_PHASE = {
  id: "final-deliverable",
  label: ui.workflowPhases.finalDeliverable,
  subtitle: "最終成果物を合成",
} as const;

function buildWorkerPhases(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `worker-${index + 1}`,
    label: ui.workflowPhases.worker(index + 1),
    subtitle: "タスクを並列実行",
  }));
}

export function buildWorkflowPhaseTemplate(
  workerCount: number = DEFAULT_PARALLEL_WORKER_SLOTS,
): readonly { id: string; label: string; subtitle: string }[] {
  return [
    CEO_PHASE,
    RESEARCH_PHASE,
    PLANNER_PLAN_PHASE,
    PLANNER_TASKS_PHASE,
    ...buildWorkerPhases(workerCount),
    REVIEWER_PHASE,
    QA_PHASE,
    CEO_APPROVAL_PHASE,
    FINAL_PHASE,
  ];
}

/** Interval for advancing the visual running phase while awaiting /api/orchestrate. */
export const LOADING_STEP_INTERVAL_MS = 6000;

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
