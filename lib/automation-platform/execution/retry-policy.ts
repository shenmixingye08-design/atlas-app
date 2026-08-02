import type { AutomationErrorCode } from "@/lib/automation-platform/errors/codes";

const RETRYABLE_CODES = new Set<string>([
  "automation_timeout",
  "automation_run_failed",
]);

const RETRYABLE_MESSAGE_PATTERNS = [
  /\b429\b/,
  /\b503\b/,
  /\b5\d\d\b/,
  /timeout/i,
  /timed out/i,
  /ECONNRESET/i,
  /ECONNREFUSED/i,
  /ENOTFOUND/i,
  /network/i,
  /fetch failed/i,
  /socket hang up/i,
  /storage/i,
  /temporar/i,
  /rate limit/i,
  /unavailable/i,
  /service unavailable/i,
];

const NON_RETRYABLE_PATTERNS = [
  /permission/i,
  /unauthorized/i,
  /forbidden/i,
  /invalid/i,
  /not found/i,
  /approval/i,
  /conflict/i,
];

/** Backoff bases in ms: 1m, 5m, 15m */
const BACKOFF_MS = [60_000, 300_000, 900_000] as const;

export function isRetryableFailure(input: {
  errorCode: string | null;
  errorMessage: string | null;
}): boolean {
  if (input.errorCode && RETRYABLE_CODES.has(input.errorCode)) return true;
  const message = input.errorMessage ?? "";
  if (!message) return false;
  if (NON_RETRYABLE_PATTERNS.some((pattern) => pattern.test(message))) {
    return false;
  }
  return RETRYABLE_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
}

/** Exponential-ish backoff with full jitter. Never infinite. */
export function computeRetryAt(input: {
  attemptCount: number;
  maxAttempts: number;
  nowMs?: number;
}): string | null {
  if (input.attemptCount >= input.maxAttempts) return null;
  const index = Math.min(input.attemptCount - 1, BACKOFF_MS.length - 1);
  const base = BACKOFF_MS[Math.max(0, index)] ?? 60_000;
  const jitter = Math.floor(Math.random() * base * 0.3);
  const delay = base + jitter;
  return new Date((input.nowMs ?? Date.now()) + delay).toISOString();
}

export function classifyExecutionError(
  error: unknown,
): { code: AutomationErrorCode | string; message: string; retryable: boolean } {
  const message = error instanceof Error ? error.message : String(error);
  if (/timeout|timed out/i.test(message)) {
    return {
      code: "automation_timeout",
      message,
      retryable: true,
    };
  }
  const retryable = isRetryableFailure({
    errorCode: null,
    errorMessage: message,
  });
  return {
    code: "automation_run_failed",
    message,
    retryable,
  };
}
