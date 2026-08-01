/** Classify automation/job errors for retry policy. */

export type RetryClassification = "retryable" | "non_retryable";

const NON_RETRYABLE_PATTERNS = [
  /oauth|認証|unauthorized|forbidden|権限/i,
  /permission|アクセス.*拒否/i,
  /invalid.*dest|宛先.*無効/i,
  /user.*disconnect|連携.*解除/i,
  /missing.*input|入力.*不足|必須.*未/i,
  /validation|バリデーション|不正な入力|bad request/i,
  /(?:^|\D)400(?:\D|$)/,
  /cancel/i,
  /402|payment|課金/i,
];

const RETRYABLE_PATTERNS = [
  /timeout|timed?\s*out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND/i,
  /(?:^|\D)(429|500|502|503|504)(?:\D|$)/,
  /一時|タイムアウト|ネットワーク|network/i,
  /rate.?limit/i,
  /storage|supabase|postgres|database|deadlock|serialization|connection pool/i,
  /EAI_AGAIN|socket hang up|fetch failed/i,
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

/**
 * Exponential backoff schedule with jitter: bases 1m / 5m / 15m.
 * Returns ISO timestamp for nextRetryAt.
 */
export function computeNextRetryAt(attempt: number, fromMs = Date.now()): string {
  const { nextAt } = requireBackoff(attempt, fromMs);
  return nextAt;
}

function requireBackoff(attempt: number, fromMs: number): { nextAt: string } {
  // Lazy import avoided — inline jitter to keep this module free of queue cycle issues.
  const bases = RETRY_BACKOFF_MS;
  const base =
    bases[Math.min(Math.max(attempt - 1, 0), bases.length - 1)] ?? bases[0]!;
  const minDelay = Math.floor(base * 0.1);
  const jitterMs = Math.floor(Math.random() * (base - minDelay + 1));
  const delayMs = minDelay + jitterMs;
  return { nextAt: new Date(fromMs + delayMs).toISOString() };
}

export const RETRY_BACKOFF_MS = [60_000, 300_000, 900_000] as const;
export const MAX_JOB_RETRIES = 3;
