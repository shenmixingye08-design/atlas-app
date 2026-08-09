import { toPublicHealthResponse } from "@/lib/health/public-health-response";
import { probeStructuredLogs } from "@/lib/reliability/structured-logs-probe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * P2-04: correlation-tagged structured logs durability probe (public flags).
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

  const result = await probeStructuredLogs();
  lastRunAtMs = Date.now();
  lastOk = result.ok;
  const body = {
    ...toPublicHealthResponse({ ok: result.ok }, { cached: false }),
    tableOk: result.tableOk,
    correlationPresent: result.correlationPresent,
    durableWriteOk: result.durableWriteOk,
    durableReadOk: result.durableReadOk,
    restartDurableOk: result.restartDurableOk,
    multiInstanceOk: result.multiInstanceOk,
    duplicateIdempotentOk: result.duplicateIdempotentOk,
    concurrentOk: result.concurrentOk,
    crossUserIsolated: result.crossUserIsolated,
    secretsRedacted: result.secretsRedacted,
    memoryNotSot: result.memoryNotSot,
    failClosedDbUnavailable: result.failClosedDbUnavailable,
    error: result.error,
    commitShaShort: result.commitShaShort,
    environment: result.environment,
  };
  lastSafeBody = body;

  console.info("[health/structured-logs]", {
    ok: result.ok,
    durableWriteOk: result.durableWriteOk,
    restartDurableOk: result.restartDurableOk,
    multiInstanceOk: result.multiInstanceOk,
    memoryNotSot: result.memoryNotSot,
    error: result.error,
  });

  return Response.json(body, {
    status: result.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function POST(request: Request): Promise<Response> {
  return GET(request);
}
