import type { OrchestrationStep } from "./types";

export class OrchestrationTimeoutError extends Error {
  readonly step: OrchestrationStep;
  readonly timeoutMs: number;
  readonly timedOut = true;

  constructor(step: OrchestrationStep, timeoutMs: number) {
    super(`${step} timed out after ${Math.round(timeoutMs / 1000)}s`);
    this.name = "OrchestrationTimeoutError";
    this.step = step;
    this.timeoutMs = timeoutMs;
  }
}

/** Default per-step timeout budget (milliseconds). */
export const STEP_TIMEOUT_MS: Readonly<Record<OrchestrationStep, number>> = {
  ceo: 90_000,
  research_assessment: 60_000,
  research_report: 120_000,
  planner_plan: 90_000,
  planner_tasks: 90_000,
  worker: 120_000,
  reviewer: 90_000,
  quality_assurance: 90_000,
  ceo_approval: 90_000,
  final_deliverable: 60_000,
};

export async function withStepTimeout<T>(
  promise: Promise<T>,
  step: OrchestrationStep,
  timeoutMs: number = STEP_TIMEOUT_MS[step],
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new OrchestrationTimeoutError(step, timeoutMs)),
      timeoutMs,
    );
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}
