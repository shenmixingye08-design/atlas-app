import {
  computeRetryAt,
  isRetryableFailure,
} from "@/lib/automation-platform/execution/retry-policy";
import type { AutomationWorkflowStep } from "@/lib/automation-platform/types/step";

export type ResolvedStepRetry = {
  maxAttempts: number;
  /** Delay before next attempt in ms (0 = immediate). */
  delayMsForAttempt: (attempt: number) => number;
  isRetryable: (errorCode: string | null, errorMessage: string | null) => boolean;
};

const DEFAULT_STEP_MAX = 3;
const DEFAULT_BACKOFF = [800, 2_000, 5_000];

/**
 * Resolve per-step retry policy with run-level fallbacks.
 * Non-retryable failures (permission, approval, invalid) never auto-retry.
 */
export function resolveStepRetryPolicy(
  step: AutomationWorkflowStep,
  runMaxAttempts: number,
): ResolvedStepRetry {
  const policy = step.retryPolicy;
  const maxAttempts = Math.max(
    1,
    Math.min(
      policy?.maxAttempts && policy.maxAttempts > 0
        ? policy.maxAttempts
        : DEFAULT_STEP_MAX,
      runMaxAttempts || DEFAULT_STEP_MAX,
    ),
  );
  const backoff =
    policy?.backoffMs && policy.backoffMs.length > 0
      ? policy.backoffMs
      : DEFAULT_BACKOFF;
  const codes = new Set(policy?.retryableErrorCodes ?? []);

  return {
    maxAttempts,
    delayMsForAttempt: (attempt) => {
      const index = Math.min(Math.max(attempt - 1, 0), backoff.length - 1);
      return backoff[index] ?? DEFAULT_BACKOFF[0]!;
    },
    isRetryable: (errorCode, errorMessage) => {
      if (errorCode && codes.size > 0 && codes.has(errorCode)) return true;
      return isRetryableFailure({ errorCode, errorMessage });
    },
  };
}

export function computeRunLevelRetryAt(input: {
  attemptCount: number;
  maxAttempts: number;
  nowMs?: number;
}): string | null {
  return computeRetryAt(input);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitStepRetryDelay(ms: number): Promise<void> {
  if (ms <= 0) return;
  await sleep(ms);
}
