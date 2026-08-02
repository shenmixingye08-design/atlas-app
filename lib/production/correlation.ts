import { randomUUID } from "crypto";

export type ProductionCorrelationIds = {
  correlationId: string;
  requestId: string | null;
  runId: string | null;
  jobId: string | null;
  artifactId: string | null;
  diagnosticId: string | null;
};

type MemoryScope = typeof globalThis & {
  __atlasCorrelationStack?: ProductionCorrelationIds[];
};

function stack(): ProductionCorrelationIds[] {
  const scope = globalThis as MemoryScope;
  if (!scope.__atlasCorrelationStack) scope.__atlasCorrelationStack = [];
  return scope.__atlasCorrelationStack;
}

export function createCorrelationIds(
  partial?: Partial<ProductionCorrelationIds>,
): ProductionCorrelationIds {
  const correlationId = partial?.correlationId?.trim() || `cor_${randomUUID()}`;
  return {
    correlationId,
    requestId: partial?.requestId ?? null,
    runId: partial?.runId ?? null,
    jobId: partial?.jobId ?? null,
    artifactId: partial?.artifactId ?? null,
    diagnosticId: partial?.diagnosticId ?? null,
  };
}

export function getCorrelationIds(): ProductionCorrelationIds {
  const current = stack()[stack().length - 1];
  return current ?? createCorrelationIds();
}

export function runWithCorrelation<T>(
  ids: Partial<ProductionCorrelationIds>,
  fn: () => T,
): T {
  const next = {
    ...getCorrelationIds(),
    ...createCorrelationIds(ids),
    correlationId:
      ids.correlationId?.trim() ||
      getCorrelationIds().correlationId ||
      createCorrelationIds().correlationId,
  };
  stack().push(next);
  try {
    return fn();
  } finally {
    stack().pop();
  }
}

export async function runWithCorrelationAsync<T>(
  ids: Partial<ProductionCorrelationIds>,
  fn: () => Promise<T>,
): Promise<T> {
  const next = {
    ...getCorrelationIds(),
    ...createCorrelationIds(ids),
    correlationId:
      ids.correlationId?.trim() ||
      getCorrelationIds().correlationId ||
      createCorrelationIds().correlationId,
  };
  stack().push(next);
  try {
    return await fn();
  } finally {
    stack().pop();
  }
}

/** Extract correlation from inbound HTTP headers. */
export function correlationFromHeaders(
  headers: Headers,
): ProductionCorrelationIds {
  return createCorrelationIds({
    correlationId:
      headers.get("x-correlation-id") ??
      headers.get("x-atlas-correlation-id") ??
      undefined,
    requestId:
      headers.get("x-request-id") ??
      headers.get("x-vercel-id") ??
      headers.get("x-vercel-request-id"),
    runId: headers.get("x-atlas-run-id"),
    jobId: headers.get("x-atlas-job-id"),
    artifactId: headers.get("x-atlas-artifact-id"),
    diagnosticId: headers.get("x-atlas-diagnostic-id"),
  });
}

export function correlationResponseHeaders(
  ids: ProductionCorrelationIds = getCorrelationIds(),
): Record<string, string> {
  const headers: Record<string, string> = {
    "x-correlation-id": ids.correlationId,
  };
  if (ids.requestId) headers["x-request-id"] = ids.requestId;
  if (ids.runId) headers["x-atlas-run-id"] = ids.runId;
  if (ids.jobId) headers["x-atlas-job-id"] = ids.jobId;
  if (ids.artifactId) headers["x-atlas-artifact-id"] = ids.artifactId;
  if (ids.diagnosticId) headers["x-atlas-diagnostic-id"] = ids.diagnosticId;
  return headers;
}
