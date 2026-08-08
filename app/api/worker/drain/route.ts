import { authorizeAutomationTick } from "@/lib/automations/tick-auth";
import { drainWorkQueue } from "@/lib/work-queue";
import { clientSafeMessage } from "@/lib/security/client-safe-message";

/**
 * Independent worker drain endpoint — not tied to a user HTTP session.
 * Auth: CRON_SECRET bearer or ATLAS owner session.
 */
export async function POST(request: Request): Promise<Response> {
  const gate = await authorizeAutomationTick(request);
  if (!gate.ok) {
    return Response.json({ error: gate.error }, { status: gate.status });
  }

  const url = new URL(request.url);
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "10", 10);
  const workerId = url.searchParams.get("workerId") ?? undefined;

  try {
    const result = await drainWorkQueue({
      limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 50) : 10,
      workerId: workerId ?? undefined,
    });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const message =
      clientSafeMessage(error, "Worker drain failed");
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request): Promise<Response> {
  return POST(request);
}
