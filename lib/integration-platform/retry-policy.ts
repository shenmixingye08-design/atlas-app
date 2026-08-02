/**
 * Retry only: 429, timeout, 5xx, network.
 * Never retry 4xx (except 429).
 */

import type { RetryClassification } from "@/lib/integration-platform/types";

export class IntegrationHttpError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, message: string, code = "http_error") {
    super(message);
    this.name = "IntegrationHttpError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function classifyError(error: unknown): RetryClassification {
  if (error instanceof IntegrationHttpError) {
    if (error.statusCode === 429) return "retryable_429";
    if (error.statusCode >= 500) return "retryable_5xx";
    if (error.statusCode >= 400 && error.statusCode < 500) {
      return "non_retryable_4xx";
    }
  }

  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error ?? "");

  if (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("aborted") ||
    message.includes("etimedout")
  ) {
    return "retryable_timeout";
  }

  if (
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("enotfound") ||
    message.includes("network") ||
    message.includes("fetch failed") ||
    message.includes("socket")
  ) {
    return "retryable_network";
  }

  // Generic status extraction
  const statusMatch = message.match(/\b([45]\d{2})\b/);
  if (statusMatch) {
    const code = Number(statusMatch[1]);
    if (code === 429) return "retryable_429";
    if (code >= 500) return "retryable_5xx";
    if (code >= 400) return "non_retryable_4xx";
  }

  return "non_retryable_other";
}

export function isRetryable(error: unknown): boolean {
  const kind = classifyError(error);
  return kind.startsWith("retryable_");
}

export type RetryPolicyOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  label?: string;
  sleep?: (ms: number) => Promise<void>;
};

export type RetryOutcome<T> = {
  value: T;
  attempts: number;
  retried: boolean;
  classifications: RetryClassification[];
};

export async function executeWithRetryPolicy<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryPolicyOptions = {},
): Promise<RetryOutcome<T>> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 200;
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const classifications: RetryClassification[] = [];
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const value = await operation(attempt);
      return {
        value,
        attempts: attempt,
        retried: attempt > 1,
        classifications,
      };
    } catch (error) {
      lastError = error;
      const kind = classifyError(error);
      classifications.push(kind);
      if (!isRetryable(error) || attempt >= maxAttempts) {
        break;
      }
      const delay =
        kind === "retryable_429"
          ? baseDelayMs * 2 ** attempt
          : baseDelayMs * 2 ** (attempt - 1);
      await sleep(delay);
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error(
    `${options.label ?? "operation"} failed after ${maxAttempts} attempts`,
  );
}
