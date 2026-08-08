import { authorizeAutomationTick } from "@/lib/automations/tick-auth";
import {
  processDueAutoPostsFromAutomationTick,
  processScheduledXPostsFromAutomationTick,
} from "@/lib/integrations/x/post/automation";
import { clientSafeMessage } from "@/lib/security/client-safe-message";

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
      // V2: enqueue from DB SoT (dispatch false here; separate durable claim below).
      v2Schedule = await processDueScheduledAutomationsV2({
        limit: 20,
        dispatch: false,
      });
      // P1-03: DB claim is multi-instance safe — dispatch in all environments
      // when atlas_automations / atlas_automation_runs SoT is ready.
      // Never fall back to process-local memory claim.
      const { isAutomationV2DbSotReady } = await import(
        "@/lib/automation-platform/repository/table-ready"
      );
      if (await isAutomationV2DbSotReady()) {
        const { dispatchAutomationRuns } = await import(
          "@/lib/automation-platform/execution/dispatch"
        );
        v2Dispatch = await dispatchAutomationRuns({ limit: 10 });
      } else {
        const { isAtlasProduction } = await import(
          "@/lib/runtime/is-production"
        );
        if (isAtlasProduction()) {
          console.error(
            "[automation tick] P1-03: V2 DB SoT not ready — skipping dispatch (fail-closed)",
          );
        }
        v2Dispatch = { processed: 0 };
      }
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

    // P1-02: drain durable notification delivery retries (not DLQ replay).
    let notificationRetries = {
      due: 0,
      claimed: 0,
      delivered: 0,
      rescheduled: 0,
      deadLettered: 0,
      skipped: 0,
      failed: 0,
      dlqReinjected: 0,
    };
    try {
      const { processDurableNotificationRetries } = await import(
        "@/lib/notifications/retry-drain"
      );
      notificationRetries = await processDurableNotificationRetries({
        limit: 20,
      });
    } catch (error) {
      console.warn("[automation tick] notification retry drain skipped:", error);
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

    // P1-07: external monitor cycle after tick success is durable-recorded.
    let externalMonitor = {
      ok: false,
      openIncidents: 0,
      deliveriesSent: 0,
      resolvedThisCycle: 0,
    };
    try {
      const { runExternalMonitorCycle } = await import(
        "@/lib/external-monitor"
      );
      const cycle = await runExternalMonitorCycle();
      externalMonitor = {
        ok: cycle.ok,
        openIncidents: cycle.openIncidents,
        deliveriesSent: cycle.deliveriesSent,
        resolvedThisCycle: cycle.resolvedThisCycle,
      };
    } catch (error) {
      console.warn("[automation tick] external monitor skipped:", error);
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
      notificationRetries,
      externalMonitor,
    });
  } catch (error) {
    const message =
      clientSafeMessage(error, "Automation tick failed");
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
