import { authorizeSchedulerTick } from "@/lib/scheduler-core/auth";
import { buildSchedulerHealthSnapshot } from "@/lib/scheduler-core/health";

/**
 * Scheduler health — Owner or Scheduler secret only.
 * Never exposes secret values or internal DB URLs.
 */
export async function GET(request: Request): Promise<Response> {
  const gate = await authorizeSchedulerTick(request, {
    allowOwner: true,
    requirePost: false,
  });
  if (!gate.ok) {
    return Response.json(
      { error: gate.error, diagnosticCode: gate.diagnosticCode },
      { status: gate.status },
    );
  }
  const snapshot = await buildSchedulerHealthSnapshot();
  return Response.json(snapshot);
}

export async function POST(request: Request): Promise<Response> {
  return GET(request);
}
