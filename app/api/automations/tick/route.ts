import { authorizeAutomationTick } from "@/lib/automations/tick-auth";
import { runWithAutomationTickContext } from "@/lib/automations/tick-context";
import { runAutomationTick } from "@/lib/automations/tick-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/**
 * HTTP ceiling only. Soft deadline lives in tick-budget (≪ 300s).
 * Do not raise this as a timeout "fix".
 */
export const maxDuration = 300;

function resolveOrigin(request: Request): string {
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ?? "http";

  if (host) {
    return `${protocol}://${host}`;
  }

  return new URL(request.url).origin;
}

/**
 * Minute-capable due tick.
 * Scheduler enqueues durable jobs; worker drains leases (step-sized).
 * Auth: `Authorization: Bearer $CRON_SECRET` or ATLAS owner session.
 *
 * One HTTP request never synchronously drains an unbounded job set.
 * Leftover work continues on the next tick / `/api/worker/drain`.
 */
export async function POST(request: Request): Promise<Response> {
  const gate = await authorizeAutomationTick(request);
  if (!gate.ok) {
    const { recordCronTickOutcome } = await import("@/lib/owner/monitoring");
    recordCronTickOutcome(false, gate.error);
    return Response.json(
      { error: gate.error, tickId: gate.tickId },
      { status: gate.status },
    );
  }

  const scheduledCronEnabled =
    process.env.ENABLE_SCHEDULED_CRON?.trim().toLowerCase() !== "false";
  if (!scheduledCronEnabled) {
    return Response.json({
      skipped: true,
      reason: "ENABLE_SCHEDULED_CRON=false",
      processed: 0,
      results: [],
      tickId: gate.tickId,
    });
  }

  const result = await runWithAutomationTickContext(
    { tickId: gate.tickId },
    () =>
      runAutomationTick({
        origin: resolveOrigin(request),
        tickId: gate.tickId,
      }),
  );
  return Response.json(result.body, { status: result.httpStatus });
}

export async function GET(request: Request): Promise<Response> {
  return POST(request);
}
