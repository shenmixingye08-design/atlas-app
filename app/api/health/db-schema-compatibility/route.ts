import { toPublicHealthResponse } from "@/lib/health/public-health-response";
import { probeDbSchemaCompatibility } from "@/lib/health/db-schema-compatibility";
import { getHealthVersionPayload } from "@/lib/health/version-info";
import { logHealthProbeSummary } from "@/lib/health/probe-observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Read-only DB_SCHEMA_COMPATIBILITY diagnostic.
 * Never inserts, updates, upserts, or deletes Production rows.
 */

let lastRunAtMs = 0;
let lastOk = false;
let lastSafeBody: Record<string, unknown> | null = null;
const MIN_INTERVAL_MS = 60_000;

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";
  const now = Date.now();
  if (!force && lastSafeBody && now - lastRunAtMs < MIN_INTERVAL_MS) {
    return Response.json(
      {
        ...lastSafeBody,
        ...toPublicHealthResponse({ ok: lastOk }, { cached: true }),
      },
      {
        status: lastOk ? 200 : 503,
        headers: { "Cache-Control": "no-store, max-age=0" },
      },
    );
  }

  const started = Date.now();
  const result = await probeDbSchemaCompatibility();
  lastRunAtMs = Date.now();
  lastOk = result.ok;
  const version = getHealthVersionPayload();
  const body = {
    ...toPublicHealthResponse({ ok: result.ok }, { cached: false }),
    diagnostic: result.diagnostic,
    dbSchemaCompatibility: result.status,
    objectCount: result.objects.length,
    compatibleCount: result.objects.filter((row) => row.status === "compatible")
      .length,
    error: result.error,
    commitShaShort: version.commitShaShort,
    environment: version.environment,
  };
  lastSafeBody = body;
  logHealthProbeSummary({
    route: "/api/health/db-schema-compatibility",
    probeId: `schema_${version.commitShaShort}`,
    durationMs: Date.now() - started,
    externalCalls: 0,
    dbWrites: 0,
    cleanupSuccess: true,
    sideEffectsRemaining: 0,
    result: result.ok ? "ok" : "error",
  });

  return Response.json(body, {
    status: result.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
