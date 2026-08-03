import { authorizeAutomationTick } from "@/lib/automations/tick-auth";
import {
  processDueAutoPostsFromAutomationTick,
  processScheduledXPostsFromAutomationTick,
} from "@/lib/integrations/x/post/automation";

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
 * Vercel Hobby cannot deploy `* * * * *` — use GitHub Actions minute workflow
 * (`.github/workflows/minute-scheduler.yml`) as the production minute path.
 * `vercel.json` keeps a daily fallback; Pro can switch to minute via
 * `vercel.cron.pro.json`.
 */
export async function POST(request: Request): Promise<Response> {
  const gate = await authorizeAutomationTick(request);
  if (!gate.ok) {
    const { recordCronTickOutcome } = await import("@/lib/owner/monitoring");
    recordCronTickOutcome(false, gate.error);
    return Response.json({ error: gate.error }, { status: gate.status });
  }

  const scheduledCronEnabled =
    process.env.ENABLE_SCHEDULED_CRON?.trim().toLowerCase() !== "false";
  if (!scheduledCronEnabled) {
    return Response.json({
      skipped: true,
      reason: "ENABLE_SCHEDULED_CRON=false",
      processed: 0,
      results: [],
    });
  }

  try {
    const origin = resolveOrigin(request);
    const { processWorkQueueTick } = await import("@/lib/work-queue/tick");
    const workQueue = await processWorkQueueTick({
      requestOrigin: origin,
    });

    let v2Schedule = {
      due: 0,
      enqueued: 0,
      deduped: 0,
      failed: 0,
      dispatched: 0,
    };
    let v2Dispatch = { processed: 0 };
    try {
      const { processDueScheduledAutomationsV2 } = await import(
        "@/lib/automation-platform/schedule/due-tick"
      );
      // V2: enqueue-only (dispatch false) — avoid sync heavy work in cron.
      v2Schedule = await processDueScheduledAutomationsV2({
        limit: 20,
        dispatch: false,
      });
      const { dispatchAutomationRuns } = await import(
        "@/lib/automation-platform/execution/dispatch"
      );
      v2Dispatch = await dispatchAutomationRuns({ limit: 10 });
    } catch (error) {
      console.warn("[automation tick] v2 schedule/dispatch skipped:", error);
    }

    const scheduledXPosts = await processScheduledXPostsFromAutomationTick();
    const autoPosts = await processDueAutoPostsFromAutomationTick();

    let dailyReports: { processed: number } = { processed: 0 };
    try {
      const { dispatchDailyReportsForDueUsers } = await import(
        "@/lib/reports/daily-dispatch"
      );
      const reportResults = await dispatchDailyReportsForDueUsers();
      dailyReports = {
        processed: reportResults.filter((row) => row.sent).length,
      };
    } catch (error) {
      console.warn("[automation tick] daily reports skipped:", error);
    }

    const { recordCronTickOutcome, recordMonitoringIncident } = await import(
      "@/lib/owner/monitoring"
    );
    const { recordAutomationCronDebug } = await import(
      "@/lib/automations/execution-log"
    );
    recordCronTickOutcome(true);

    recordAutomationCronDebug({
      ok: true,
      dueCount: workQueue.schedule.due,
      successCount: workQueue.worker.completed,
      failureCount: workQueue.worker.failed,
    });

    for (const alert of workQueue.alerts.filter((a) => a.severity === "critical")) {
      recordMonitoringIncident({
        kind: "automation_failure",
        targetId: "automation",
        message: `[work-queue] ${alert.code}: ${alert.message}`,
        critical: true,
        source: "automation_tick",
      });
    }

    return Response.json({
      processed: workQueue.worker.completed + workQueue.worker.failed,
      workQueue,
      v2Schedule,
      v2Dispatch,
      scheduledXPosts: {
        processed: scheduledXPosts.length,
        results: scheduledXPosts,
      },
      autoPosts: {
        processedUsers: autoPosts.length,
        results: autoPosts,
      },
      dailyReports,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Automation tick failed";
    const { recordCronTickOutcome } = await import("@/lib/owner/monitoring");
    const { recordAutomationCronDebug } = await import(
      "@/lib/automations/execution-log"
    );
    recordCronTickOutcome(false, message);
    recordAutomationCronDebug({ ok: false, error: message });
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request): Promise<Response> {
  return POST(request);
}
