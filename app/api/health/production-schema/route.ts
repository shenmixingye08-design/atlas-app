import {
  authorizeHealthProbe,
  healthUnauthorizedResponse,
} from "@/lib/health/authorize-health-probe";
import { toPublicHealthResponse } from "@/lib/health/public-health-response";
import { getHealthVersionPayload } from "@/lib/health/version-info";
import { probeProductionAutomationSchema } from "@/lib/health/production-schema-probe";
import { toPublicSchemaCompatibility } from "@/lib/health/schema-compatibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Production automation schema readiness.
 * Public GET: boolean flags + compatibility enums. If objects are missing,
 * the server applies idempotent ensure SQL (no user-row writes).
 * apply=1: CRON_SECRET / owner only — always re-runs ensure SQL.
 */

let lastRunAtMs = 0;
let lastOk = false;
let lastSafeBody: Record<string, unknown> | null = null;
const MIN_INTERVAL_MS = 30_000;

function buildSafeBody(
  result: Awaited<ReturnType<typeof probeProductionAutomationSchema>>,
) {
  const version = getHealthVersionPayload();
  return {
    ...toPublicHealthResponse({ ok: result.ok }, { cached: false }),
    deliverableFilesOk: result.deliverableFiles.selectOk && result.deliverableFiles.upsertOk,
    automationJobsOk: result.automationJobs.selectOk && result.automationJobs.insertOk,
    xAutopostSettingsOk:
      result.xAutopostSettings.selectOk && result.xAutopostSettings.upsertOk,
    claimXPostJobsOk: result.claimXPostJobs.rpcOk === true,
    schemaErrorCount: result.schemaErrors.length,
    ...toPublicSchemaCompatibility(result.compatibility),
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

  const result = await probeProductionAutomationSchema({ apply });
  lastRunAtMs = Date.now();
  lastOk = result.ok;
  const body = buildSafeBody(result);
  lastSafeBody = body;

  console.info("[health/production-schema]", {
    ok: result.ok,
    deliverableFilesOk: body.deliverableFilesOk,
    automationJobsOk: body.automationJobsOk,
    xAutopostSettingsOk: body.xAutopostSettingsOk,
    claimXPostJobsOk: body.claimXPostJobsOk,
    schemaErrorCount: result.schemaErrors.length,
    dbSchemaCompatibility: result.compatibility.status,
    applyRequested: apply,
    appliedViaPostgres: result.appliedViaPostgres,
    appliedViaManagementApi: result.appliedViaManagementApi,
  });

  return Response.json(body, {
    status: result.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
