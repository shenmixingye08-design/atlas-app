import type {
  StepInvokeResult,
  StepInvoker,
} from "@/lib/automation-platform/execution/step-invoker";
import type { AutomationWorkflowStep } from "@/lib/automation-platform/types/step";

export class StepTimeoutError extends Error {
  readonly code = "automation_timeout";
  readonly retryable = true;

  constructor(stepName: string, timeoutMs: number) {
    super(`Step timeout: ${stepName} exceeded ${timeoutMs}ms`);
    this.name = "StepTimeoutError";
  }
}

/**
 * Invoke a step with Abort-style timeout via Promise.race.
 * Does not cancel underlying work (Node fetch may continue) — marks failure.
 */
export async function invokeWithStepTimeout(
  invoker: StepInvoker,
  input: Parameters<StepInvoker>[0],
  timeoutMs: number,
): Promise<StepInvokeResult> {
  const ms = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 120_000;
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      invoker(input),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new StepTimeoutError(input.step.name, ms));
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function resolveStepTimeoutMs(step: AutomationWorkflowStep): number {
  if (typeof step.timeoutMs === "number" && step.timeoutMs > 0) {
    return step.timeoutMs;
  }
  return 120_000;
}
