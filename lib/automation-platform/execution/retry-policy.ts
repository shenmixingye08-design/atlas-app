import type { AutomationErrorCode } from "@/lib/automation-platform/errors/codes";
import { classifyFailure } from "@/lib/automation-platform/reliability/failure-class";

const RETRYABLE_CODES = new Set<string>([
  "automation_timeout",
  "automation_run_failed",
  "hang_timeout",
]);

const RETRYABLE_MESSAGE_PATTERNS = [
  /\b429\b/,
  /\b5\d\d\b/,
  /timeout/i,
  /timed out/i,
  /ECONNRESET/i,
  /ENOTFOUND/i,
  /network/i,
  /fetch failed/i,
  /storage/i,
  /temporar/i,
  /rate limit/i,
  /unavailable/i,
];

const NON_RETRYABLE_PATTERNS = [
  /permission/i,
  /unauthorized/i,
  /forbidden/i,
  /invalid/i,
  /not found/i,
  /approval/i,
  /conflict/i,
  /hang_timeout_exhausted/i,
];

/** Exponential backoff bases: 15s, 1m, 5m, 15m, 30m — never infinite. */
const BACKOFF_MS = [15_000, 60_000, 300_000, 900_000, 1_800_000] as const;

export function isRetryableFailure(input: {
  errorCode: string | null;
  errorMessage: string | null;
}): boolean {
  const classified = classifyFailure(input);
  if (!classified.retryable) return false;
  if (input.errorCode && RETRYABLE_CODES.has(input.errorCode)) return true;
  const message = input.errorMessage ?? "";
  if (!message) return classified.retryable;
  if (NON_RETRYABLE_PATTERNS.some((pattern) => pattern.test(message))) {
    return false;
  }
  if (RETRYABLE_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))) {
    return true;
  }
  return classified.retryable && classified.failureClass !== "validation";
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
