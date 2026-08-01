/** Classify automation/job errors for retry policy. */

export type RetryClassification = "retryable" | "non_retryable";

const NON_RETRYABLE_PATTERNS = [
  /oauth|認証|unauthorized|forbidden|権限|認証切れ/i,
  /permission|アクセス.*拒否|permission_denied/i,
  /invalid.*dest|宛先.*無効|invalid_recipient/i,
  /user.*disconnect|連携.*解除/i,
  /missing.*input|入力.*不足|必須.*未|required_information_missing|needs_input/i,
  /cancel|user_cancelled/i,
  /402|payment|課金/i,
  /revoked|token.*revoked|invalid_grant/i,
  /unsupported|未対応/i,
  /file_corrupted|corrupt|破損|0-?byte|zero.?byte/i,
  /(?:^|\D)400(?:\D|$)|bad.?request|入力不正/i,
];

const RETRYABLE_PATTERNS = [
  /timeout|timed?\s*out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|429|503|502|504|500/i,
  /一時|タイムアウト|ネットワーク|network|fetch failed/i,
  /rate.?limit/i,
  /storage.*(temp|一時)|db.*(temp|一時)|connection.*(reset|refused)/i,
  /token.*expired|expired.*token|access_token.*expired/i,
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
 * Job-scheduler backoff: 1m / 5m / 15m (attempt 1-based) + optional jitter.
 * Immediate HTTP retries use IMMEDIATE_RETRY_BACKOFF_MS in reliability/retry.ts.
 */
export function computeNextRetryAt(
  attempt: number,
  fromMs = Date.now(),
  options?: { jitterRatio?: number }
): string {
  const delays = [60_000, 300_000, 900_000];
  const base = delays[Math.min(Math.max(attempt - 1, 0), delays.length - 1)]!;
  // Default no jitter for deterministic scheduling; callers may opt in.
  const jitterRatio = options?.jitterRatio ?? 0;
  const jitter =
    jitterRatio > 0 ? Math.floor(base * jitterRatio * Math.random()) : 0;
  return new Date(fromMs + base + jitter).toISOString();
}

export const RETRY_BACKOFF_MS = [60_000, 300_000, 900_000] as const;
/** Immediate external-call style: 2s / 5s / 10s / 30s (Phase3 policy). */
export const IMMEDIATE_EXTERNAL_BACKOFF_MS = [2_000, 5_000, 10_000, 30_000] as const;
export const MAX_JOB_RETRIES = 3;
