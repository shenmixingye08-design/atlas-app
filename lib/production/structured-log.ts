import { getCorrelationIds } from "./correlation";

export type StructuredLogLevel = "debug" | "info" | "warn" | "error";

export type StructuredLogFields = {
  level: StructuredLogLevel;
  message: string;
  at: string;
  service?: string;
  event?: string;
  correlationId?: string;
  requestId?: string | null;
  runId?: string | null;
  jobId?: string | null;
  artifactId?: string | null;
  diagnosticId?: string | null;
  durationMs?: number;
  status?: "ok" | "error" | "degraded";
  meta?: Record<string, string | number | boolean | null | undefined>;
};

type MemoryScope = typeof globalThis & {
  __atlasStructuredLogs?: StructuredLogFields[];
};

const SENSITIVE =
  /password|secret|token|authorization|api[_-]?key|cookie|private|base64|email|phone/i;

function sanitizeMeta(
  meta?: StructuredLogFields["meta"],
): StructuredLogFields["meta"] {
  if (!meta) return undefined;
  const out: NonNullable<StructuredLogFields["meta"]> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (SENSITIVE.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    if (typeof value === "string" && value.length > 500) {
      out[key] = `${value.slice(0, 500)}…`;
      continue;
    }
    out[key] = value;
  }
  return out;
}

function buffer(): StructuredLogFields[] {
  const scope = globalThis as MemoryScope;
  if (!scope.__atlasStructuredLogs) scope.__atlasStructuredLogs = [];
  return scope.__atlasStructuredLogs;
}

/**
 * Structured logging — never "console.log only".
 * Emits JSON line + keeps a bounded in-memory ring for owner ops.
 */
export function structuredLog(
  level: StructuredLogLevel,
  message: string,
  fields?: Omit<StructuredLogFields, "level" | "message" | "at">,
): StructuredLogFields {
  const ids = getCorrelationIds();
  const entry: StructuredLogFields = {
    level,
    message: message.slice(0, 1000),
    at: new Date().toISOString(),
    service: fields?.service ?? "atlas",
    event: fields?.event,
    correlationId: fields?.correlationId ?? ids.correlationId,
    requestId: fields?.requestId ?? ids.requestId,
    runId: fields?.runId ?? ids.runId,
    jobId: fields?.jobId ?? ids.jobId,
    artifactId: fields?.artifactId ?? ids.artifactId,
    diagnosticId: fields?.diagnosticId ?? ids.diagnosticId,
    durationMs: fields?.durationMs,
    status: fields?.status,
    meta: sanitizeMeta(fields?.meta),
  };

  const buf = buffer();
  buf.push(entry);
  if (buf.length > 500) buf.splice(0, buf.length - 500);

  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);

  return entry;
}

export function listStructuredLogsForTests(): StructuredLogFields[] {
  return [...buffer()];
}

export function resetStructuredLogsForTests(): void {
  (globalThis as MemoryScope).__atlasStructuredLogs = [];
}
