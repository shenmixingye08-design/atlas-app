import { authorizeAutomationTick } from "@/lib/automations/tick-auth";
import { isAtlasProduction } from "@/lib/runtime/is-production";
import { FORMAL_SCHEDULER_TICK_PATH } from "@/lib/scheduler-core/types";
import { runSchedulerCoreTick } from "@/lib/scheduler-core/due-tick";

/**
 * @deprecated Phase 2-2 — not a Production Cron target.
 * Formal entry: POST /api/internal/scheduler/tick
 *
 * - Production + cron secret header → 410 (execution forbidden; prevents dual cron)
 * - Owner / non-prod session → delegates to the SAME runSchedulerCoreTick service
 * - No redirect
 */
export async function POST(request: Request): Promise<Response> {
  const authorization = request.headers.get("authorization");
  const hasCronBearer = Boolean(authorization?.startsWith("Bearer "));
  const hasCronHeader = Boolean(
    request.headers.get("x-cron-secret") ||
      request.headers.get("x-scheduler-cron-secret"),
  );

  if (isAtlasProduction() && (hasCronBearer || hasCronHeader)) {
    return Response.json(
      {
        ok: false,
        deprecated: true,
        error: "Deprecated Scheduler route",
        message: `Use ${FORMAL_SCHEDULER_TICK_PATH} for Production Cron`,
        formalPath: FORMAL_SCHEDULER_TICK_PATH,
      },
      { status: 410 },
    );
  }

  const gate = await authorizeAutomationTick(request);
  if (!gate.ok) {
    const { recordCronTickOutcome } = await import("@/lib/owner/monitoring");
    recordCronTickOutcome(false, gate.error);
    return Response.json(
      {
        error: gate.error,
        deprecated: true,
        formalPath: FORMAL_SCHEDULER_TICK_PATH,
        ok: false,
      },
      { status: gate.status },
    );
  }

  const result = await runSchedulerCoreTick();
  const { recordCronTickOutcome } = await import("@/lib/owner/monitoring");
  recordCronTickOutcome(result.schedulerStatus !== "failed");

  return Response.json({
    deprecated: true,
    formalPath: FORMAL_SCHEDULER_TICK_PATH,
    ...result,
    // Legacy shape for Owner panel compatibility
    processed:
      (result.worker?.completed ?? 0) + (result.worker?.failed ?? 0),
  });
}

export async function GET(request: Request): Promise<Response> {
  return POST(request);
}
