import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { listScheduleAlerts } from "@/lib/automation-platform/reliability/alerts";
import { listExecutionEvents } from "@/lib/automation-platform/reliability/execution-events";
import { getScheduleReliabilitySnapshot } from "@/lib/automation-platform/reliability/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  await requireAtlasOwner();
  const metrics = getScheduleReliabilitySnapshot();
  const alerts = listScheduleAlerts(30);
  const events = listExecutionEvents({ limit: 50 });
  return Response.json(
    { metrics, alerts, events },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
