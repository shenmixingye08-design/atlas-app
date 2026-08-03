import type { DropboxRetryHistoryEntry } from "./types";

const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 400;

export type DropboxRetryClassification = {
  retryable: boolean;
  errorCode: string;
  httpStatus?: number;
  retryAfterMs?: number;
};

export function classifyDropboxProviderError(error: unknown): DropboxRetryClassification {
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
      errorCode: "dropbox_permission_denied",
      httpStatus: httpStatus ?? 403,
    };
  }
  if (/unauthorized|invalid_grant|revoked|401/i.test(message)) {
    return {
      retryable: false,
      errorCode: "dropbox_auth_failed",
      httpStatus: httpStatus ?? 401,
    };
  }
  if (/not found|404|folder.*missing|does not exist/i.test(message)) {
    return {
      retryable: false,
      errorCode: "dropbox_folder_not_found",
      httpStatus: httpStatus ?? 404,
    };
  }
  if (/invalid artifact|invalid filename|bad request|400|already exists/i.test(
    message,
  )) {
    return {
      retryable: false,
      errorCode: "dropbox_invalid_input",
      httpStatus: httpStatus ?? 400,
    };
  }
  if (/429|rate limit|quota/i.test(message)) {
    const retryAfter = message.match(/retry[- ]after[=:\s]+(\d+)/i);
    return {
      retryable: true,
      errorCode: "dropbox_rate_limited",
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
      errorCode: "dropbox_transient_error",
      httpStatus: httpStatus && httpStatus >= 500 ? httpStatus : undefined,
    };
  }

  return {
    retryable: false,
    errorCode: "dropbox_upload_failed",
    httpStatus,
  };
}

export function computeDropboxRetryDelayMs(input: {
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

export function getDropboxMaxAttempts(): number {
  return MAX_ATTEMPTS;
}

export async function withDropboxRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options?: {
    onRetry?: (entry: DropboxRetryHistoryEntry) => void;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<{ value: T; retryCount: number; history: DropboxRetryHistoryEntry[] }> {
  const sleep =
    options?.sleep ??
    ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const history: DropboxRetryHistoryEntry[] = [];
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const value = await operation(attempt);
      return { value, retryCount: attempt - 1, history };
    } catch (error) {
      lastError = error;
      const classified = classifyDropboxProviderError(error);
      const entry: DropboxRetryHistoryEntry = {
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
        computeDropboxRetryDelayMs({
          attempt,
          retryAfterMs: classified.retryAfterMs,
        }),
      );
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error("Dropbox upload failed after retries");
}
