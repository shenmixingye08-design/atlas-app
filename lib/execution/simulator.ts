import type { ActionRequest } from "@/lib/actions/types";

import { generateExecutionSummary, phaseLabel } from "./summaries";
import {
  EXECUTION_EXTENSION_STUBS,
  PHASE_DURATIONS_MS,
  type ExecutionTimelineStep,
  type SandboxExecutionPlan,
  type SimulatedExecution,
  type SimulationPhase,
} from "./types";

const PHASE_ORDER: SimulationPhase[] = [
  "queued",
  "preparing",
  "executing",
  "completed",
];

export function buildTimeline(
  currentPhase: SimulationPhase,
): ExecutionTimelineStep[] {
  const currentIndex = PHASE_ORDER.indexOf(currentPhase);

  return PHASE_ORDER.map((phase, index) => ({
    phase,
    label: phaseLabel(phase),
    durationMs: index < currentIndex ? PHASE_DURATIONS_MS[phase] : 0,
    completed: index <= currentIndex,
  }));
}

function buildInitialExecution(action: ActionRequest): SimulatedExecution {
  const { summary, detail } = generateExecutionSummary(action);

  return {
    actionId: action.id,
    action: action.action,
    providerName: action.providerName,
    targetService: action.targetService,
    phase: "queued",
    statusLabel: phaseLabel("queued"),
    totalDurationMs: 0,
    summary,
    detail,
    timeline: buildTimeline("queued"),
  };
}

/** Create initial sandbox execution plan from Action Engine queue. */
export function createSandboxPlan(
  actions: readonly ActionRequest[],
): SandboxExecutionPlan {
  return {
    executions: actions.map((action) => buildInitialExecution(action)),
    extensions: EXECUTION_EXTENSION_STUBS,
  };
}

export function advanceExecution(
  execution: SimulatedExecution,
  nextPhase: SimulationPhase,
  totalDurationMs: number,
): SimulatedExecution {
  return {
    ...execution,
    phase: nextPhase,
    statusLabel: phaseLabel(nextPhase),
    totalDurationMs,
    timeline: buildTimeline(nextPhase),
  };
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export { PHASE_DURATIONS_MS, PHASE_ORDER };
