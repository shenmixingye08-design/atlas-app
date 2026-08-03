import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { getSchedulerBridgeHealth } from "@/lib/scheduler-core/bridge";
import { evaluateWorkQueueAlerts } from "@/lib/work-queue/alerts";
import { listScheduleCapabilities } from "@/lib/work-queue/capabilities";
import { getWorkQueueStore } from "@/lib/work-queue";

export async function GET(): Promise<Response> {
  try {
    await requireAtlasOwner();
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const metrics = await getWorkQueueStore().metrics();
  const alerts = await evaluateWorkQueueAlerts();
  let bridge = null;
  try {
    bridge = await getSchedulerBridgeHealth();
  } catch {
    bridge = null;
  }
  return Response.json({
    metrics,
    bridge,
    alerts,
    capabilities: listScheduleCapabilities(),
    generatedAt: new Date().toISOString(),
  });
}
