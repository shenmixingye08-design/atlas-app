import type { WordPressRetryHistoryEntry } from "./types";

const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 400;

export type WordPressRetryClassification = {
  retryable: boolean;
  errorCode: string;
  httpStatus?: number;
  retryAfterMs?: number;
};

export function classifyWordPressProviderError(
  error: unknown,
): WordPressRetryClassification {
  const message = error instanceof Error ? error.message : String(error);
  const statusMatch = message.match(/\b([45]\d\d)\b/);
  const httpStatus = statusMatch
    ? Number.parseInt(statusMatch[1]!, 10)
    : undefined;

  if (
    error instanceof Error &&
    error.name === "WordPressApiError" &&
    /401|403/.test(message)
  ) {
    return {
      retryable: false,
      errorCode: "wordpress_auth_failed",
      httpStatus: httpStatus ?? 401,
    };
  }
  if (/unauthorized|invalid_grant|auth|401|403/i.test(message)) {
    return {
      retryable: false,
      errorCode: "wordpress_auth_failed",
      httpStatus: httpStatus ?? 401,
    };
  }
  if (/validation|title and content|postId required|invalid action/i.test(message)) {
    return {
      retryable: false,
      errorCode: "wordpress_invalid_input",
      httpStatus: httpStatus ?? 400,
    };
  }
  if (/artifact|media|checksum|owner mismatch/i.test(message)) {
    return {
      retryable: false,
      errorCode: "wordpress_media_failed",
      httpStatus: httpStatus ?? 400,
    };
  }
  if (/approval|rejected/i.test(message)) {
    return {
      retryable: false,
      errorCode: "wordpress_approval_rejected",
      httpStatus: 403,
    };
  }
  if (/not found|404|rest_no_route/i.test(message)) {
    return {
      retryable: false,
      errorCode: "wordpress_post_not_found",
      httpStatus: httpStatus ?? 404,
    };
  }
  if (/429|rate limit|quota/i.test(message)) {
    const retryAfter = message.match(/retry[- ]after[=:\s]+(\d+)/i);
    return {
      retryable: true,
      errorCode: "wordpress_rate_limited",
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
      errorCode: "wordpress_transient_error",
      httpStatus: httpStatus && httpStatus >= 500 ? httpStatus : undefined,
    };
  }

  return {
    retryable: false,
    errorCode: "wordpress_operation_failed",
    httpStatus,
  };
}

export function computeWordPressRetryDelayMs(input: {
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

export function getWordPressMaxAttempts(): number {
  return MAX_ATTEMPTS;
}

export async function withWordPressRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options?: {
    onRetry?: (entry: WordPressRetryHistoryEntry) => void;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<{ value: T; retryCount: number; history: WordPressRetryHistoryEntry[] }> {
  const sleep =
    options?.sleep ??
    ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const history: WordPressRetryHistoryEntry[] = [];
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const value = await operation(attempt);
      return { value, retryCount: attempt - 1, history };
    } catch (error) {
      lastError = error;
      const classified = classifyWordPressProviderError(error);
      const entry: WordPressRetryHistoryEntry = {
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
        computeWordPressRetryDelayMs({
          attempt,
          retryAfterMs: classified.retryAfterMs,
        }),
      );
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error("WordPress operation failed after retries");
}
