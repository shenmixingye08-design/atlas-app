import type {
  AdapterExecuteInput,
  IntegrationService,
  LiveExecutionResult,
  LiveIntegrationAdapter,
  ValidationResult,
} from "../types";
import {
  buildIdempotencyKey,
  getIdempotentResult,
  saveIdempotentResult,
} from "../idempotency";
import { recordAdapterMetric } from "../metrics";
import { buildExecutionResult, mapProviderError } from "../result";

export function okValidation(message = "接続済み"): ValidationResult {
  return { ok: true, code: "ok", message };
}

export function failValidation(
  code: string,
  message: string,
): ValidationResult {
  return { ok: false, code, message };
}

export async function withAdapterGuards(input: {
  adapter: LiveIntegrationAdapter;
  executeInput: AdapterExecuteInput;
  idempotencyKey: string;
  run: () => Promise<LiveExecutionResult>;
}): Promise<LiveExecutionResult> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();

  const existing = getIdempotentResult(input.idempotencyKey);
  if (existing) {
    return buildExecutionResult({
      status: "duplicate_skipped",
      externalActionId: existing.externalActionId,
      externalUrl: existing.externalUrl,
      startedAt,
      retryable: false,
      summary: "同一操作のため再実行をスキップしました（idempotency）",
      requiresExternalActionId: input.adapter.requiresExternalActionId,
      metadata: {
        duplicateOf: existing.diagnosticId,
        idempotencyKey: input.idempotencyKey,
      },
      costUsage: { providerCalls: 0 },
    });
  }

  const connection = await input.adapter.validateConnection(
    input.executeInput.userId,
  );
  if (!connection.ok) {
    const result = buildExecutionResult({
      status:
        connection.code === "needs_configuration"
          ? "needs_configuration"
          : "needs_connection",
      startedAt,
      errorCode: connection.code,
      summary: connection.message,
      requiresExternalActionId: false,
    });
    recordSample(input.adapter.service, result, t0, null);
    return result;
  }

  const permissions = await input.adapter.validatePermissions(
    input.executeInput.userId,
  );
  if (!permissions.ok) {
    const result = buildExecutionResult({
      status: "needs_permission",
      startedAt,
      errorCode: permissions.code,
      summary: permissions.message,
      requiresExternalActionId: false,
    });
    recordSample(input.adapter.service, result, t0, null);
    return result;
  }

  try {
    const result = await input.run();
    if (
      result.status === "succeeded" &&
      input.adapter.requiresExternalActionId &&
      !result.externalActionId
    ) {
      const failed = buildExecutionResult({
        status: "failed",
        startedAt,
        errorCode: "missing_external_action_id",
        summary: "externalActionId なしの成功は禁止です",
        requiresExternalActionId: false,
      });
      recordSample(input.adapter.service, failed, t0, null);
      return failed;
    }
    if (result.status === "succeeded" || result.status === "duplicate_skipped") {
      saveIdempotentResult(input.idempotencyKey, result);
    }
    recordSample(
      input.adapter.service,
      result,
      t0,
      result.errorCode === "provider_rate_limited" ? 429 : null,
    );
    return result;
  } catch (error) {
    const mapped = mapProviderError(error);
    const result = buildExecutionResult({
      status: "failed",
      startedAt,
      retryable: mapped.retryable,
      errorCode: mapped.errorCode,
      summary: mapped.message,
      requiresExternalActionId: false,
    });
    recordSample(input.adapter.service, result, t0, mapped.statusCodeHint);
    return result;
  }
}

function recordSample(
  service: IntegrationService,
  result: LiveExecutionResult,
  t0: number,
  statusCodeHint: number | null,
): void {
  recordAdapterMetric({
    service,
    ok: result.status === "succeeded" || result.status === "duplicate_skipped",
    latencyMs: Date.now() - t0,
    retryable: result.retryable,
    errorCode: result.errorCode,
    statusCodeHint,
    at: new Date().toISOString(),
  });
}

export function standardIdempotencyKey(
  service: IntegrationService,
  input: AdapterExecuteInput,
  extra?: {
    destination?: string | null;
    recipient?: string | null;
    account?: string | null;
    eventKey?: string | null;
  },
): string {
  return buildIdempotencyKey({
    runId: input.runId,
    stepId: input.stepId,
    provider: service,
    occurrenceKey: input.occurrenceKey,
    contentHash: input.contentHash,
    artifactHash: input.contentHash,
    destination: extra?.destination,
    recipient: extra?.recipient,
    account: extra?.account,
    eventKey: extra?.eventKey,
  });
}
