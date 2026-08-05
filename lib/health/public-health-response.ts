/**
 * P08: Never expose internals on /api/health/* HTTP responses.
 * Migration names, SQL, schema identifiers, env fingerprints,
 * stack traces, and raw exception text stay server-side only.
 */

const FORBIDDEN_KEYS = new Set([
  "sqlPreview",
  "sql",
  "migrationFiles",
  "migrationFile",
  "migrations",
  "stack",
  "stackTrace",
  "envPresence",
  "postgresEnvKeys",
  "projectRef",
  "schema",
  "schemaCache",
  "tableName",
  "tableNames",
  "subscriptionsTableExists",
  "webhookEventsTableExists",
  "tableExists",
  "appliedViaPostgres",
  "appliedViaManagementApi",
  "usingDurableFallback",
  "probeJobId",
  "openAiErrorMessage",
  "openAiErrorType",
  "openAiErrorCode",
  "openAiRequestId",
  "commitSha",
  "model",
  "transport",
  "structure",
  "image",
  "detail",
  "errorDetail",
  "cause",
  "rawError",
  "rawErrorBody",
]);

const FORBIDDEN_ERROR_PATTERN =
  /schema|migration|postgres|supabase|sql|stack|exception|at\s+\S+\(|CREATE TABLE|atlas_/i;

export type PublicHealthStatus = {
  ok: boolean;
  status: "ok" | "degraded" | "unavailable";
  cached?: boolean;
  checkedAt: string;
};

/**
 * Strip sensitive probe payloads down to a public-safe health status.
 */
export function toPublicHealthResponse(
  input: Readonly<Record<string, unknown>> | null | undefined,
  options?: { cached?: boolean },
): PublicHealthStatus {
  const ok = Boolean(input && input.ok === true);
  return {
    ok,
    status: ok ? "ok" : "unavailable",
    ...(options?.cached != null ? { cached: options.cached } : {}),
    checkedAt: new Date().toISOString(),
  };
}

/** Deep-clean accidental leakage if a route still spreads a probe object. */
export function scrubHealthPayload<T extends Record<string, unknown>>(
  payload: T,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    if (key === "error" || key === "message") {
      if (typeof value === "string" && FORBIDDEN_ERROR_PATTERN.test(value)) {
        out[key] = "unavailable";
        continue;
      }
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = scrubHealthPayload(value as Record<string, unknown>);
      continue;
    }
    out[key] = value;
  }
  return out;
}

export function healthAuthFailedStatus(status: number): number {
  // Prefer 401 unauthorized; map forbidden-like to 403; never 200.
  if (status === 403) return 403;
  if (status === 401) return 401;
  if (status >= 400 && status < 500) return status === 404 ? 401 : status;
  // Misconfigured cron in prod was 503 — still deny as 401 to avoid probing.
  return 401;
}
