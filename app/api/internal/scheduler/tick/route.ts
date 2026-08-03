import { authorizeSchedulerTick } from "@/lib/scheduler-core/auth";
import { runSchedulerCoreTick } from "@/lib/scheduler-core/due-tick";
import { newSchedulerRequestId } from "@/lib/scheduler-core/ids";
import { logSchedulerCore } from "@/lib/scheduler-core/observability";

/**
 * Formal Production Scheduler entry (Phase 2-2).
 * Vercel Cron + GitHub Actions minute workflow MUST target this path.
 * In-process service call — no self-HTTP fetch.
 */
export async function POST(request: Request): Promise<Response> {
  const requestId =
    request.headers.get("x-request-id")?.trim() || newSchedulerRequestId();
  const gate = await authorizeSchedulerTick(request, {
    allowOwner: true,
    requirePost: true,
  });
  if (!gate.ok) {
    logSchedulerCore({
      event: "SCHEDULER_AUTH_FAILED",
      requestId,
      errorCode: gate.diagnosticCode,
      status: String(gate.status),
    });
    return Response.json(
      {
        requestStatus: "error",
        schedulerStatus: "unauthorized",
        error: gate.error,
        diagnosticCode: gate.diagnosticCode,
        ok: false,
      },
      { status: gate.status },
    );
  }

  const result = await runSchedulerCoreTick({ requestId });

  // Optional legacy companions (X / daily reports) — do not fail the scheduler core.
  try {
    const {
      processDueAutoPostsFromAutomationTick,
      processScheduledXPostsFromAutomationTick,
    } = await import("@/lib/integrations/x/post/automation");
    await processScheduledXPostsFromAutomationTick();
    await processDueAutoPostsFromAutomationTick();
  } catch (error) {
    console.warn("[scheduler-core] x companions skipped:", error);
  }
  try {
    const { dispatchDailyReportsForDueUsers } = await import(
      "@/lib/reports/daily-dispatch"
    );
    await dispatchDailyReportsForDueUsers();
  } catch (error) {
    console.warn("[scheduler-core] daily reports skipped:", error);
  }

  const httpStatus =
    result.schedulerStatus === "failed"
      ? 500
      : result.schedulerStatus === "unauthorized" ||
          result.schedulerStatus === "misconfigured"
        ? 503
        : 200;

  return Response.json(result, { status: httpStatus });
}

/** Method restriction: GET is not allowed on the formal route. */
export async function GET(): Promise<Response> {
  return Response.json(
    {
      requestStatus: "error",
      schedulerStatus: "unauthorized",
      error: "Method not allowed",
      diagnosticCode: "scheduler_method_not_allowed",
      ok: false,
    },
    { status: 403 },
  );
}
