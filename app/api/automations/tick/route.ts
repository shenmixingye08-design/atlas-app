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
 * Auth: `Authorization: Bearer $CRON_SECRET` (Vercel Cron) or signed-in Clerk session.
 */
export async function POST(request: Request): Promise<Response> {
  const gate = await authorizeAutomationTick(request);
  if (!gate.ok) {
    const { recordCronTickOutcome } = await import("@/lib/owner/monitoring");
    recordCronTickOutcome(false, gate.error);
    return Response.json({ error: gate.error }, { status: gate.status });
  }

  try {
    const origin = resolveOrigin(request);
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
      dailyReports = { processed: reportResults.filter((r) => r.sent).length };
    } catch (error) {
      console.warn("[automation tick] daily reports skipped:", error);
    }

    const { recordCronTickOutcome, recordMonitoringIncident } = await import(
      "@/lib/owner/monitoring"
    );
    recordCronTickOutcome(true);

    const failed = results.filter((r) => r.status === "failed");
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
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Automation tick failed";
    const { recordCronTickOutcome } = await import("@/lib/owner/monitoring");
    recordCronTickOutcome(false, message);
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request): Promise<Response> {
  return POST(request);
}
