import { randomUUID } from "crypto";

import type {
  AdapterCostUsage,
  LiveExecutionResult,
  LiveExecutionStatus,
} from "./types";

export function buildExecutionResult(input: {
  status: LiveExecutionStatus;
  externalActionId?: string | null;
  externalUrl?: string | null;
  startedAt: string;
  completedAt?: string;
  retryable?: boolean;
  errorCode?: string | null;
  diagnosticId?: string;
  providerRequestId?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
  costUsage?: Partial<AdapterCostUsage>;
  summary: string;
  requiresExternalActionId?: boolean;
}): LiveExecutionResult {
  const successLike =
    input.status === "succeeded" || input.status === "duplicate_skipped";
  const externalActionId = input.externalActionId ?? null;
  const externalUrl = input.externalUrl ?? null;

  if (
    successLike &&
    input.requiresExternalActionId !== false &&
    !externalActionId
  ) {
    return {
      status: "failed",
      externalActionId: null,
      externalUrl: null,
      startedAt: input.startedAt,
      completedAt: input.completedAt ?? new Date().toISOString(),
      retryable: false,
      errorCode: "missing_external_action_id",
      diagnosticId: input.diagnosticId ?? randomUUID(),
      providerRequestId: input.providerRequestId ?? null,
      metadata: input.metadata ?? {},
      costUsage: {
        providerCalls: input.costUsage?.providerCalls ?? 0,
        bytesUploaded: input.costUsage?.bytesUploaded,
        estimatedCostUsd: input.costUsage?.estimatedCostUsd,
      },
      summary:
        "externalActionId がないため成功扱いできません（途中成功禁止）",
    };
  }

  // Ban placeholder / fake ids
  if (
    successLike &&
    externalActionId &&
    /^(stub|fake|mock|placeholder|null|undefined|test-)/i.test(externalActionId)
  ) {
    return {
      status: "failed",
      externalActionId: null,
      externalUrl: null,
      startedAt: input.startedAt,
      completedAt: input.completedAt ?? new Date().toISOString(),
      retryable: false,
      errorCode: "fake_external_action_id",
      diagnosticId: input.diagnosticId ?? randomUUID(),
      providerRequestId: input.providerRequestId ?? null,
      metadata: input.metadata ?? {},
      costUsage: { providerCalls: input.costUsage?.providerCalls ?? 0 },
      summary: "偽の externalActionId は成功扱い禁止です",
    };
  }

  return {
    status: input.status,
    externalActionId,
    externalUrl,
    startedAt: input.startedAt,
    completedAt: input.completedAt ?? new Date().toISOString(),
    retryable: input.retryable ?? false,
    errorCode: input.errorCode ?? null,
    diagnosticId: input.diagnosticId ?? randomUUID(),
    providerRequestId: input.providerRequestId ?? null,
    metadata: input.metadata ?? {},
    costUsage: {
      providerCalls: input.costUsage?.providerCalls ?? 0,
      bytesUploaded: input.costUsage?.bytesUploaded,
      estimatedCostUsd: input.costUsage?.estimatedCostUsd,
    },
    summary: input.summary,
  };
}

export function mapProviderError(error: unknown): {
  errorCode: string;
  retryable: boolean;
  statusCodeHint: number | null;
  message: string;
} {
  const message =
    error instanceof Error ? error.message : String(error ?? "unknown");
  const statusMatch = message.match(/\b(401|403|404|409|429|5\d\d)\b/);
  const statusCodeHint = statusMatch ? Number(statusMatch[1]) : null;

  if (/401|unauthorized|revoked|invalid.?token/i.test(message)) {
    return {
      errorCode: "token_revoked_or_unauthorized",
      retryable: false,
      statusCodeHint: statusCodeHint ?? 401,
      message: message.slice(0, 240),
    };
  }
  if (/403|forbidden|insufficient.?scope|permission/i.test(message)) {
    return {
      errorCode: "permission_denied",
      retryable: false,
      statusCodeHint: statusCodeHint ?? 403,
      message: message.slice(0, 240),
    };
  }
  if (/429|rate.?limit/i.test(message)) {
    return {
      errorCode: "provider_rate_limited",
      retryable: true,
      statusCodeHint: 429,
      message: message.slice(0, 240),
    };
  }
  if (/5\d\d|ECONNRESET|ETIMEDOUT|network/i.test(message)) {
    return {
      errorCode: "provider_unavailable",
      retryable: true,
      statusCodeHint: statusCodeHint ?? 503,
      message: message.slice(0, 240),
    };
  }
  return {
    errorCode: "provider_error",
    retryable: false,
    statusCodeHint,
    message: message.slice(0, 240),
  };
}
