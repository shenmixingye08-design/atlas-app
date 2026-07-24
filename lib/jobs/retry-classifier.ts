/** Classify automation/job errors for retry policy. */

export type RetryClassification = "retryable" | "non_retryable";

const NON_RETRYABLE_PATTERNS = [
  /oauth|認証|unauthorized|forbidden|権限/i,
  /permission|アクセス.*拒否/i,
  /invalid.*dest|宛先.*無効/i,
  /user.*disconnect|連携.*解除/i,
  /missing.*input|入力.*不足|必須.*未/i,
  /cancel/i,
  /402|payment|課金/i,
];

const RETRYABLE_PATTERNS = [
  /timeout|timed?\s*out|ETIMEDOUT|ECONNRESET|429|503|502|504/i,
  /一時|タイムアウト|ネットワーク|network/i,
  /rate.?limit/i,
];

export function classifyRetryError(error: unknown): RetryClassification {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : String(error ?? "");

  for (const pattern of NON_RETRYABLE_PATTERNS) {
    if (pattern.test(message)) return "non_retryable";
  }

  for (const pattern of RETRYABLE_PATTERNS) {
    if (pattern.test(message)) return "retryable";
  }

  return "non_retryable";
}

/** Exponential backoff schedule: 1m, 5m, 15m (attempt 1-based). */
export function computeNextRetryAt(attempt: number, fromMs = Date.now()): string {
  const delays = [60_000, 300_000, 900_000];
  const delay = delays[Math.min(Math.max(attempt - 1, 0), delays.length - 1)];
  return new Date(fromMs + delay).toISOString();
}

export const RETRY_BACKOFF_MS = [60_000, 300_000, 900_000] as const;
export const MAX_JOB_RETRIES = 3;
