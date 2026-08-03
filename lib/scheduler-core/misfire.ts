import type { MisfirePolicy } from "./types";
import { CATCH_UP_LIMIT, DEFAULT_MISFIRE_POLICY } from "./types";

export type MisfireDecision =
  | { action: "enqueue"; reason: null }
  | { action: "skip_missed"; reason: string }
  | { action: "catch_up"; reason: string; remainingSkips: number };

/**
 * Decide how to treat a due schedule whose scheduledAt is in the past.
 * Never creates unlimited catch-up occurrences.
 */
export function decideMisfire(input: {
  policy?: MisfirePolicy | null;
  scheduledAt: Date;
  now: Date;
  catchUpAlready?: number;
}): MisfireDecision {
  const policy = input.policy ?? DEFAULT_MISFIRE_POLICY;
  const delayMs = input.now.getTime() - input.scheduledAt.getTime();
  if (delayMs <= 0) {
    return { action: "enqueue", reason: null };
  }

  if (policy === "run_once_immediately") {
    return { action: "enqueue", reason: null };
  }
  if (policy === "skip_missed") {
    return {
      action: "skip_missed",
      reason: `missed_by_${delayMs}ms_policy_skip`,
    };
  }
  // catch_up_limited
  const already = input.catchUpAlready ?? 0;
  if (already >= CATCH_UP_LIMIT) {
    return {
      action: "skip_missed",
      reason: `catch_up_limit_${CATCH_UP_LIMIT}`,
    };
  }
  return {
    action: "catch_up",
    reason: `catch_up_${already + 1}_of_${CATCH_UP_LIMIT}`,
    remainingSkips: CATCH_UP_LIMIT - already - 1,
  };
}
