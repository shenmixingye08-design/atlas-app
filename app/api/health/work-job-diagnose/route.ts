import {
  authorizeHealthProbe,
  healthUnauthorizedResponse,
} from "@/lib/health/authorize-health-probe";
import { diagnoseWorkJobProduction } from "@/lib/work-jobs/diagnose-production";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * CRON_SECRET / Owner only — Production work-job failure diagnose.
 * Returns redacted structured logs + reliability events + durable job fields.
 */
export async function GET(request: Request): Promise<Response> {
  const gate = await authorizeHealthProbe(request);
  if (!gate.ok) return healthUnauthorizedResponse(gate);

  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId")?.trim() || "";
  const userId = url.searchParams.get("userId")?.trim() || null;
  if (!jobId || jobId.length < 8) {
    return Response.json(
      { ok: false, error: "jobId_required" },
      { status: 400, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  const result = await diagnoseWorkJobProduction({ jobId, userId });
  console.info("[health/work-job-diagnose]", {
    ok: result.ok,
    jobIdPrefix: jobId.slice(0, 8),
    status: result.derived.status,
    failedStage: result.derived.failedStage,
    developerCode: result.derived.developerCode,
    failureClass: result.derived.failureClass,
    structuredLogCount: result.structuredLogs.length,
    reliabilityEventCount: result.reliabilityEvents.length,
  });

  return Response.json(result, {
    status: result.ok ? 200 : 404,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
