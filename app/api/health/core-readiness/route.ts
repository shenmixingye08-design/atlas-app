import { toPublicHealthResponse } from "@/lib/health/public-health-response";
import { getHealthVersionPayload } from "@/lib/health/version-info";
import {
  collectCoreReadiness,
  coreReadinessHttpStatus,
  coreReadinessPublicStatus,
} from "@/lib/health/core-readiness";
import { logProductionApiError } from "@/lib/reliability/production-error-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * P5 cheap Production readiness rollup.
 * No OpenAI/Stripe/X calls. No schema apply. Boolean flags only.
 */
let lastRunAtMs = 0;
let lastBody: Record<string, unknown> | null = null;
let lastStatus = 503;
const MIN_INTERVAL_MS = 30_000;

function buildSafeBody(
  snapshot: Awaited<ReturnType<typeof collectCoreReadiness>>,
  cached: boolean,
) {
  const version = getHealthVersionPayload();
  const publicStatus = coreReadinessPublicStatus(snapshot.readiness);
  return {
    ...toPublicHealthResponse(
      { ok: snapshot.readiness === "healthy" },
      { cached, status: publicStatus },
    ),
    readiness: snapshot.readiness,
    supabaseConfigured: snapshot.checks.supabaseConfigured,
    serviceRoleConfigured: snapshot.checks.serviceRoleConfigured,
    supabaseReachable: snapshot.checks.supabaseReachable,
    billingStoreOk: snapshot.checks.billingStore === "ok",
    automationStoreOk: snapshot.checks.automationStore === "ok",
    workJobStoreOk: snapshot.checks.workJobStore === "ok",
    openaiConfigured: snapshot.checks.openaiConfigured,
    integrationsConfigured: snapshot.checks.integrationsConfigured,
    sharpRuntimeOk: snapshot.checks.sharpRuntime === "ok",
    environment: version.environment,
    commitShaShort: version.commitShaShort,
  };
}

export async function GET(request: Request): Promise<Response> {
  const force = new URL(request.url).searchParams.get("force") === "1";
  const now = Date.now();
  if (!force && lastBody && now - lastRunAtMs < MIN_INTERVAL_MS) {
    return Response.json(
      { ...lastBody, cached: true },
      {
        status: lastStatus,
        headers: { "Cache-Control": "no-store, max-age=0" },
      },
    );
  }

  const snapshot = await collectCoreReadiness();
  const status = coreReadinessHttpStatus(snapshot.readiness);
  const body = buildSafeBody(snapshot, false);

  if (snapshot.readiness !== "healthy") {
    logProductionApiError({
      endpoint: "/api/health/core-readiness",
      code:
        snapshot.readiness === "degraded"
          ? "core_readiness_degraded"
          : "core_readiness_unhealthy",
      diagnosticId: `p5_core_${snapshot.readiness}`,
      failureStage: "core_readiness",
      subsystem: "health",
      message: snapshot.readiness,
    });
  }

  lastRunAtMs = Date.now();
  lastBody = body;
  lastStatus = status;

  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
