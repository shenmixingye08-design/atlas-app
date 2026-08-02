import { randomUUID } from "crypto";

import { getCorrelationIds } from "./correlation";
import { structuredLog } from "./structured-log";

export type TraceSpan = {
  traceId: string;
  spanId: string;
  name: string;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  status: "running" | "ok" | "error";
  correlationId: string;
  attributes?: Record<string, string | number | boolean | null>;
};

type MemoryScope = typeof globalThis & {
  __atlasTraceSpans?: TraceSpan[];
};

function spans(): TraceSpan[] {
  const scope = globalThis as MemoryScope;
  if (!scope.__atlasTraceSpans) scope.__atlasTraceSpans = [];
  return scope.__atlasTraceSpans;
}

export function startSpan(
  name: string,
  attributes?: TraceSpan["attributes"],
): TraceSpan {
  const ids = getCorrelationIds();
  const span: TraceSpan = {
    traceId: ids.correlationId,
    spanId: `span_${randomUUID()}`,
    name,
    startedAt: new Date().toISOString(),
    status: "running",
    correlationId: ids.correlationId,
    attributes,
  };
  const buf = spans();
  buf.push(span);
  if (buf.length > 300) buf.splice(0, buf.length - 300);
  return span;
}

export function endSpan(
  span: TraceSpan,
  status: "ok" | "error" = "ok",
): TraceSpan {
  const endedAt = new Date().toISOString();
  const durationMs = Math.max(
    0,
    new Date(endedAt).getTime() - new Date(span.startedAt).getTime(),
  );
  span.endedAt = endedAt;
  span.durationMs = durationMs;
  span.status = status;
  structuredLog(status === "ok" ? "info" : "error", `span:${span.name}`, {
    event: "trace_span",
    durationMs,
    status: status === "ok" ? "ok" : "error",
    meta: {
      spanId: span.spanId,
      traceId: span.traceId,
    },
  });
  return span;
}

export async function withSpan<T>(
  name: string,
  fn: () => Promise<T>,
  attributes?: TraceSpan["attributes"],
): Promise<T> {
  const span = startSpan(name, attributes);
  try {
    const result = await fn();
    endSpan(span, "ok");
    return result;
  } catch (error) {
    endSpan(span, "error");
    throw error;
  }
}

export function listTraceSpansForTests(): TraceSpan[] {
  return [...spans()];
}

export function resetTracingForTests(): void {
  (globalThis as MemoryScope).__atlasTraceSpans = [];
}
