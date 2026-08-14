export type RetryClass = "retryable" | "non_retryable";

const RETRYABLE_CODES = new Set([
  "network_timeout",
  "timeout",
  "http_429",
  "http_500",
  "http_502",
  "http_503",
  "http_504",
  "db_temporary",
  "storage_temporary",
  "external_temporary",
  "openai_timeout",
  "lease_lost",
  "stuck_recovered",
  "provider_5xx",
  "network",
]);

const NON_RETRYABLE_CODES = new Set([
  "invalid_input",
  "invalid_payload",
  "missing_connection",
  "connection_not_configured",
  "x_not_connected",
  "revoked_authorization",
  "oauth_revoked",
  "auth_expired",
  "insufficient_permission",
  "scope_insufficient",
  "insufficient_scope",
  "unsupported_operation",
  "validation_failure",
  "user_cancelled",
  "cancelled",
  "approval_pending",
  "permanent_4xx",
]);

export function classifyErrorCode(errorCode: string | null | undefined): RetryClass {
  if (!errorCode) return "retryable";
  const code = errorCode.trim().toLowerCase();
  if (NON_RETRYABLE_CODES.has(code)) return "non_retryable";
  if (RETRYABLE_CODES.has(code)) return "retryable";
  if (code.startsWith("http_5")) return "retryable";
  if (code === "http_429") return "retryable";
  if (code.startsWith("http_4")) return "non_retryable";
  if (code.includes("timeout") || code.includes("network")) return "retryable";
  if (code.includes("temporary")) return "retryable";
  return "non_retryable";
}

/** Exponential backoff with full jitter. attempt is 1-based after failure. */
export function computeRetryAtIso(attempt: number, nowMs = Date.now()): string {
  const baseMs = Math.min(60_000 * 2 ** Math.max(0, attempt - 1), 15 * 60_000);
  const jitter = Math.floor(Math.random() * baseMs);
  return new Date(nowMs + jitter).toISOString();
}

export type RetryDecision = {
  retryable: boolean;
  retryAt: string | null;
  userMessage: string;
  developerMessage: string;
  deadLetter: boolean;
};

export function decideRetry(input: {
  errorCode: string | null;
  attempt: number;
  maxAttempts: number;
  nowMs?: number;
}): RetryDecision {
  const klass = classifyErrorCode(input.errorCode);
  const retryable = klass === "retryable";
  const exhausted = input.attempt >= input.maxAttempts;
  if (!retryable) {
    return {
      retryable: false,
      retryAt: null,
      userMessage: "この失敗は自動再試行できません。接続や権限をご確認ください。",
      developerMessage: `non_retryable:${input.errorCode ?? "unknown"}`,
      deadLetter: false,
    };
  }
  if (exhausted) {
    return {
      retryable: false,
      retryAt: null,
      userMessage: "再試行上限に達しました。診断IDを添えてサポートへご連絡ください。",
      developerMessage: `max_attempts:${input.attempt}/${input.maxAttempts}`,
      deadLetter: true,
    };
  }
  return {
    retryable: true,
    retryAt: computeRetryAtIso(input.attempt, input.nowMs),
    userMessage: "一時的な障害のため、自動で再試行します。",
    developerMessage: `retryable:${input.errorCode ?? "unknown"} attempt=${input.attempt}`,
    deadLetter: false,
  };
}
