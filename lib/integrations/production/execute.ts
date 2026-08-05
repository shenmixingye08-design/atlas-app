import {
  createIntegrationDiagnosticId,
  createIntegrationRequestId,
  recordIntegrationAudit,
} from "./audit";
import {
  getIdempotentResult,
  saveIdempotentResult,
} from "./idempotency";
import {
  classifyIntegrationError,
  withIntegrationRetry,
} from "./retry";
import type {
  IntegrationActionResult,
  RunIntegrationOptions,
} from "./types";

export type IntegrationExecutionResult<T> = {
  value: T;
  request_id: string;
  diagnosticId: string;
  result: IntegrationActionResult;
  retry: number;
  durationMs: number;
  duplicate: boolean;
};

function mapErrorToResult(error: unknown): IntegrationActionResult {
  const classification = classifyIntegrationError(error);
  if (classification === "retryable_timeout") return "timeout";
  if (classification === "retryable_429" || classification === "retryable_5xx") {
    return "retry_exhausted";
  }

  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (
    message.includes("reconnect") ||
    message.includes("unauthorized") ||
    message.includes("auth") ||
    message.includes("token")
  ) {
    return "auth_failure";
  }
  if (
    message.includes("permission") ||
    message.includes("scope") ||
    message.includes("forbidden")
  ) {
    return "insufficient_permission";
  }
  if (message.includes("validat") || message.includes("invalid")) {
    return "validation_failed";
  }
  return "error";
}

/**
 * Production wrapper: idempotency → retry → audit for any integration action.
 * New services register via the connector registry and call this helper.
 */
export async function runIntegrationAction<T>(
  options: RunIntegrationOptions,
  operation: () => Promise<T>,
): Promise<IntegrationExecutionResult<T>> {
  const request_id = options.requestId ?? createIntegrationRequestId();
  const diagnosticId = createIntegrationDiagnosticId({
    integration: options.integration,
    action: options.action,
    requestId: request_id,
  });
  const started = Date.now();
  const preventDuplicate = options.preventDuplicate !== false;
  const idempotencyKey = options.idempotencyKey;

  if (preventDuplicate && idempotencyKey) {
    const prior = getIdempotentResult<T>(idempotencyKey);
    if (prior !== null) {
      const durationMs = Date.now() - started;
      recordIntegrationAudit({
        request_id,
        diagnosticId,
        integration: options.integration,
        action: options.action,
        result: "duplicate",
        retry: 0,
        durationMs,
        userId: options.userId,
        idempotencyKey,
        message: "duplicate prevented",
      });
      return {
        value: prior,
        request_id,
        diagnosticId,
        result: "duplicate",
        retry: 0,
        durationMs,
        duplicate: true,
      };
    }
  }

  try {
    const { value, attempts } = await withIntegrationRetry(
      () => operation(),
      {
        maxAttempts: options.maxAttempts ?? 4,
        label: `${options.integration}.${options.action}`,
      },
    );

    const durationMs = Date.now() - started;
    const retry = Math.max(0, attempts - 1);

    if (preventDuplicate && idempotencyKey) {
      saveIdempotentResult({
        key: idempotencyKey,
        integration: String(options.integration),
        action: options.action,
        result: value,
      });
    }

    recordIntegrationAudit({
      request_id,
      diagnosticId,
      integration: options.integration,
      action: options.action,
      result: "success",
      retry,
      durationMs,
      userId: options.userId,
      idempotencyKey,
    });

    return {
      value,
      request_id,
      diagnosticId,
      result: "success",
      retry,
      durationMs,
      duplicate: false,
    };
  } catch (error) {
    const durationMs = Date.now() - started;
    const result = mapErrorToResult(error);
    recordIntegrationAudit({
      request_id,
      diagnosticId,
      integration: options.integration,
      action: options.action,
      result,
      retry: Math.max(0, (options.maxAttempts ?? 4) - 1),
      durationMs,
      userId: options.userId,
      idempotencyKey,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
