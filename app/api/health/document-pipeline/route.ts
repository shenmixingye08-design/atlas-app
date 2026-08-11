import {
  authorizeHealthProbe,
  healthUnauthorizedResponse,
} from "@/lib/health/authorize-health-probe";
import { toPublicHealthResponse } from "@/lib/health/public-health-response";
import { probeDocumentPipelineSchema } from "@/lib/deliverables/document-pipeline-schema-probe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * P0-7 document pipeline schema readiness.
 * Public GET: boolean flags only.
 * apply=1: CRON_SECRET / owner only — applies atlas_document_generation_jobs DDL.
 */

let lastRunAtMs = 0;
let lastOk = false;
let lastSafeBody: Record<string, unknown> | null = null;
const MIN_INTERVAL_MS = 30_000;

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

  const result = await probeDocumentPipelineSchema({ apply });
  lastRunAtMs = Date.now();
  lastOk = result.ok;
  const body = {
    ...toPublicHealthResponse({ ok: result.ok }, { cached: false }),
    tableOk: result.tableOk,
    documentGenerationJobsOk: result.documentGenerationJobsOk,
    deliverableJobsOk: result.deliverableJobsOk,
    memoryNotSot: result.memoryNotSot,
    ...(apply
      ? {
          appliedViaPostgres: result.appliedViaPostgres,
          appliedViaManagementApi: result.appliedViaManagementApi,
          envPresence: {
            serviceRole: result.envPresence.serviceRole,
            postgresUrl: result.envPresence.postgresUrl,
            supabaseAccessToken: result.envPresence.supabaseAccessToken,
            projectRefPresent: Boolean(result.envPresence.projectRef),
            postgresEnvKeyCount: result.envPresence.postgresEnvKeys.length,
          },
        }
      : {}),
    error: result.error,
    ownerHint: result.ownerHint,
    commitShaShort: result.commitShaShort,
    environment: result.environment,
  };
  lastSafeBody = body;

  console.info("[health/document-pipeline]", {
    ok: result.ok,
    tableOk: result.tableOk,
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

export async function POST(request: Request): Promise<Response> {
  return GET(request);
}
