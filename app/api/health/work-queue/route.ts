import { toPublicHealthResponse } from "@/lib/health/public-health-response";
import { probeWorkQueueSchema } from "@/lib/work-queue/schema-probe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Work-queue / minute-tick durability probe (public, boolean flags only).
 * Used to diagnose Production `/api/automations/tick` HTTP 500 without secrets.
 */

let lastRunAtMs = 0;
let lastOk = false;
let lastSafeBody: Record<string, unknown> | null = null;
const MIN_INTERVAL_MS = 30_000;

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

  const result = await probeWorkQueueSchema();
  lastRunAtMs = Date.now();
  lastOk = result.ok;
  const body = {
    ...toPublicHealthResponse({ ok: result.ok }, { cached: false }),
    postgresUrlConfigured: result.postgresUrlConfigured,
    extendedPostgresUrlOnly: result.extendedPostgresUrlOnly,
    storeReady: result.storeReady,
    tablesOk: result.tablesOk,
    metricsOk: result.metricsOk,
    memoryNotSot: result.memoryNotSot,
    multiInstanceSafe: result.multiInstanceSafe,
    developerCode: result.developerCode,
    error: result.error,
    commitShaShort: result.commitShaShort,
    environment: result.environment,
  };
  lastSafeBody = body;

  console.info("[health/work-queue]", {
    ok: result.ok,
    postgresUrlConfigured: result.postgresUrlConfigured,
    extendedPostgresUrlOnly: result.extendedPostgresUrlOnly,
    storeReady: result.storeReady,
    tablesOk: result.tablesOk,
    developerCode: result.developerCode,
  });

  return Response.json(body, {
    status: result.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function POST(request: Request): Promise<Response> {
  return GET(request);
}
