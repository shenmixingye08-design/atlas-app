import { automationService } from "@/lib/automations/automation-service";
import { authorizeAutomationTick } from "@/lib/automations/tick-auth";
import {
  processDueAutoPostsFromAutomationTick,
  processScheduledXPostsFromAutomationTick,
} from "@/lib/integrations/x/post/automation";

function resolveOrigin(request: Request): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ?? "http";

  if (host) {
    return `${protocol}://${host}`;
  }

  return new URL(request.url).origin;
}

/**
 * Process automations whose nextRun is due.
 * Auth: `Authorization: Bearer $CRON_SECRET` (Vercel Cron) or ATLAS owner session.
 *
 * Hobby: vercel.json keeps daily cron (`0 0 * * *`). Minute cron is for Pro
 * only (see vercel.cron.pro.json). Owner/secret manual ticks remain available.
 */
export async function POST(request: Request): Promise<Response> {
  const gate = await authorizeAutomationTick(request);
  if (!gate.ok) {
    const { recordCronTickOutcome } = await import("@/lib/owner/monitoring");
    recordCronTickOutcome(false, gate.error);
    return Response.json({ error: gate.error }, { status: gate.status });
  }

  // Optional kill-switch for Preview / emergency freeze. Default: enabled.
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

    let reliability: {
      retriesProcessed: number;
      hangsDetected: number;
      dedupeSkips: number;
    } = {
      retriesProcessed: 0,
      hangsDetected: 0,
      dedupeSkips: 0,
    };
    try {
      const { processJobReliabilityTick } = await import(
        "@/lib/jobs/tick-processor"
      );
      reliability = await processJobReliabilityTick({ requestOrigin: origin });
    } catch (error) {
      console.warn("[automation tick] job reliability skipped:", error);
    }

    const results = await automationService.processDueAutomations({
      requestOrigin: origin,
    });
    const scheduledXPosts = await processScheduledXPostsFromAutomationTick();
    const autoPosts = await processDueAutoPostsFromAutomationTick();

    let dailyReports: { processed: number } = { processed: 0 };
    try {
      const { dispatchDailyReportsForDueUsers } = await import(
        "@/lib/reports/daily-dispatch"
      );
      const reportResults = await dispatchDailyReportsForDueUsers();
      dailyReports = { processed: reportResults.filter((row) => row.sent).length };
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

    const failed = results.filter((r) => r.status === "failed");
    const succeeded = results.filter((r) => r.status === "completed");
    recordAutomationCronDebug({
      ok: true,
      dueCount: results.length,
      successCount: succeeded.length,
      failureCount: failed.length,
    });

    for (const row of failed.slice(0, 5)) {
      recordMonitoringIncident({
        kind: "automation_failure",
        targetId: "automation",
        message: row.error ?? "Automation run failed",
        critical: true,
        source: "automation_tick",
      });
    }

    return Response.json({
      processed: results.length,
      results,
      scheduledXPosts: {
        processed: scheduledXPosts.length,
        results: scheduledXPosts,
      },
      autoPosts: {
        processedUsers: autoPosts.length,
        results: autoPosts,
      },
      dailyReports,
      reliability,
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
