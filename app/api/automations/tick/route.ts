import { automationService } from "@/lib/automations/automation-service";
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
 * Future: invoke from Vercel Cron, GitHub Actions, or external scheduler.
 */
export async function POST(request: Request): Promise<Response> {
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
