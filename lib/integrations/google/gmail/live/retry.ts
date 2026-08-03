import type { GmailRetryHistoryEntry } from "./types";

const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 400;

export type GmailRetryClassification = {
  retryable: boolean;
  errorCode: string;
  httpStatus?: number;
  retryAfterMs?: number;
};

export function classifyGmailProviderError(
  error: unknown,
): GmailRetryClassification {
  const message = error instanceof Error ? error.message : String(error);
  const statusMatch = message.match(/\b([45]\d\d)\b/);
  const httpStatus = statusMatch
    ? Number.parseInt(statusMatch[1]!, 10)
    : undefined;

  if (
    /missing[_ ]scope|insufficient|permission|forbidden|403/i.test(message)
  ) {
    return {
      retryable: false,
      errorCode: "gmail_permission_denied",
      httpStatus: httpStatus ?? 403,
    };
  }
  if (/unauthorized|invalid_grant|revoked|401/i.test(message)) {
    return {
      retryable: false,
      errorCode: "gmail_auth_failed",
      httpStatus: httpStatus ?? 401,
    };
  }
  if (
    /invalid recipient|invalid.?to|bad request|400|header injection|crlf/i.test(
      message,
    )
  ) {
    return {
      retryable: false,
      errorCode: "gmail_invalid_input",
      httpStatus: httpStatus ?? 400,
    };
  }
  if (/attachment|artifact|checksum|mime/i.test(message) && /fail|missing|invalid|denied/i.test(message)) {
    return {
      retryable: false,
      errorCode: "gmail_attachment_failed",
      httpStatus: httpStatus ?? 400,
    };
  }
  if (/approval|rejected/i.test(message)) {
    return {
      retryable: false,
      errorCode: "gmail_approval_rejected",
      httpStatus: 403,
    };
  }
  if (/reply.*not found|thread.*not found|404/i.test(message)) {
    return {
      retryable: false,
      errorCode: "gmail_reply_target_invalid",
      httpStatus: httpStatus ?? 404,
    };
  }
  if (/429|rate limit|quota/i.test(message)) {
    const retryAfter = message.match(/retry[- ]after[=:\s]+(\d+)/i);
    return {
      retryable: true,
      errorCode: "gmail_rate_limited",
      httpStatus: 429,
      retryAfterMs: retryAfter
        ? Number.parseInt(retryAfter[1]!, 10) * 1000
        : undefined,
    };
  }
  if (
    /timeout|timed out|ECONNRESET|ENOTFOUND|network|fetch failed|5\d\d|unavailable|temporar/i.test(
      message,
    )
  ) {
    return {
      retryable: true,
      errorCode: "gmail_transient_error",
      httpStatus: httpStatus && httpStatus >= 500 ? httpStatus : undefined,
    };
  }

  return {
    retryable: false,
    errorCode: "gmail_operation_failed",
    httpStatus,
  };
}

export function computeGmailRetryDelayMs(input: {
  attempt: number;
  retryAfterMs?: number;
}): number {
  if (input.retryAfterMs && input.retryAfterMs > 0) {
    return input.retryAfterMs;
  }
  const exp = BASE_DELAY_MS * 2 ** Math.max(0, input.attempt - 1);
  const jitter = Math.floor(Math.random() * exp * 0.3);
  return exp + jitter;
}

export function getGmailMaxAttempts(): number {
  return MAX_ATTEMPTS;
}

export async function withGmailRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options?: {
    onRetry?: (entry: GmailRetryHistoryEntry) => void;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<{ value: T; retryCount: number; history: GmailRetryHistoryEntry[] }> {
  const sleep =
    options?.sleep ??
    ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const history: GmailRetryHistoryEntry[] = [];
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const value = await operation(attempt);
      return { value, retryCount: attempt - 1, history };
    } catch (error) {
      lastError = error;
      const classified = classifyGmailProviderError(error);
      const entry: GmailRetryHistoryEntry = {
        attempt,
        at: new Date().toISOString(),
        errorCode: classified.errorCode,
        errorMessage: error instanceof Error ? error.message : String(error),
        httpStatus: classified.httpStatus,
        retryAfterMs: classified.retryAfterMs,
      };
      history.push(entry);

      if (!classified.retryable || attempt >= MAX_ATTEMPTS) {
        break;
      }
      options?.onRetry?.(entry);
      await sleep(
        computeGmailRetryDelayMs({
          attempt,
          retryAfterMs: classified.retryAfterMs,
        }),
      );
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error("Gmail operation failed after retries");
}
