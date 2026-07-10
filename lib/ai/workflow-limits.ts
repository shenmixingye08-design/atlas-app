/** Hard limits to prevent expensive orchestration loops. */

/** Shown when estimated cost exceeds threshold (future UI confirmation). */
export const COST_CONFIRMATION_MESSAGE =
  "この依頼は通常より多くのAI処理が必要です。実行しますか？";

export const WORKFLOW_LIMITS = {
  /** Max LLM API calls per workflow run (planner + worker + research + reviewer fallback + 1 retry). */
  maxLlmCalls: 5,
  /** Max worker revision retries after deterministic QA failure. */
  maxWorkerRetries: 1,
  /** Max estimated workflow cost (USD) before stopping with 要確認. */
  maxEstimatedCostUsd: 1.5,
  /** Max total output tokens budget across all calls. */
  maxTotalOutputTokens: 20_000,
} as const;

export class WorkflowLimitError extends Error {
  readonly code = "workflow_limit" as const;

  constructor(message: string) {
    super(message);
    this.name = "WorkflowLimitError";
  }
}
