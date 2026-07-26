/** Hard limits to prevent expensive orchestration loops. */

/** Shown when estimated cost exceeds threshold (future UI confirmation). */
export const COST_CONFIRMATION_MESSAGE =
  "この依頼は通常より多くのAI処理が必要です。実行しますか？";

export const WORKFLOW_LIMITS = {
  /**
   * Max LLM API calls per workflow run.
   * Fast path still uses ~2–3. Full Quality Engine may use Reviewer / Judge / up to 2 improves.
   */
  maxLlmCalls: 8,
  /** Max worker revision retries after QA / Quality Judge failure. */
  maxWorkerRetries: 2,
  /** Max estimated workflow cost (USD) before stopping with 要確認. */
  maxEstimatedCostUsd: 1.5,
  /** Max total output tokens budget across all calls. */
  maxTotalOutputTokens: 24_000,
} as const;

export class WorkflowLimitError extends Error {
  readonly code = "workflow_limit" as const;

  constructor(message: string) {
    super(message);
    this.name = "WorkflowLimitError";
  }
}
