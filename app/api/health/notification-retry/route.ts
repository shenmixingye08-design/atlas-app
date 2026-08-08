import {
  authorizeHealthProbe,
  healthUnauthorizedResponse,
} from "@/lib/health/authorize-health-probe";
import { toPublicHealthResponse } from "@/lib/health/public-health-response";
import { getHealthVersionPayload } from "@/lib/health/version-info";
import { probeNotificationRetrySchema } from "@/lib/notifications/schema-probe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * P1-02: Notification retry/DLQ readiness + tick wiring probe.
 * Read-only (default): public boolean flags only.
 * apply=1: CRON_SECRET / owner only — applies durable inbox + DLQ DDL if missing.
 */

let lastRunAtMs = 0;
let lastOk = false;
let lastSafeBody: Record<string, unknown> | null = null;
const MIN_INTERVAL_MS = 30_000;

function buildSafeBody(
  result: Awaited<ReturnType<typeof probeNotificationRetrySchema>>,
) {
  const version = getHealthVersionPayload();
  return {
    ...toPublicHealthResponse({ ok: result.ok }, { cached: false }),
    inboxTableOk: result.inboxTableOk,
    dlqTableOk: result.dlqTableOk,
    tickWired: result.tickWired,
    retryDrainReady: result.retryDrainReady,
    memoryNotSot: result.memoryNotSot,
    commitShaShort: version.commitShaShort,
    environment: version.environment,
  };
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";
  const apply = url.searchParams.get("apply") === "1";

  if (apply) {
    const gate = await authorizeHealthProbe(request);
    if (!gate.ok) return healthUnauthorizedResponse(gate);
  }

  const now = Date.now();
  if (!force && !apply && lastSafeBody && now - lastRunAtMs < MIN_INTERVAL_MS) {
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

  const result = await probeNotificationRetrySchema({ apply });
  lastRunAtMs = Date.now();
  lastOk = result.ok;
  const body = buildSafeBody(result);
  lastSafeBody = body;

  console.info("[health/notification-retry]", {
    ok: result.ok,
    inboxTableOk: result.inboxTableOk,
    dlqTableOk: result.dlqTableOk,
    tickWired: result.tickWired,
    applyRequested: apply,
    appliedViaPostgres: result.appliedViaPostgres,
    appliedViaManagementApi: result.appliedViaManagementApi,
    error: result.error,
  });

  return Response.json(body, {
    status: result.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
