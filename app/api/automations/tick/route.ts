import { automationService } from "@/lib/automations/automation-service";
import { authorizeAutomationTick } from "@/lib/automations/tick-auth";
import { processScheduledXPostsFromAutomationTick } from "@/lib/integrations/x/post/automation";

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
    return Response.json({ error: gate.error }, { status: gate.status });
  }

  const origin = resolveOrigin(request);
  const results = await automationService.processDueAutomations({
    requestOrigin: origin,
  });
  const scheduledXPosts = await processScheduledXPostsFromAutomationTick();

  return Response.json({
    processed: results.length,
    results,
    scheduledXPosts: {
      processed: scheduledXPosts.length,
      results: scheduledXPosts,
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  return POST(request);
}
