import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { getSchedulerBridgeHealth } from "@/lib/scheduler-core/bridge";
import { buildSchedulerOpsSnapshot } from "@/lib/scheduler-core/ops";
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
  let ops = null;
  try {
    ops = await buildSchedulerOpsSnapshot();
  } catch {
    ops = null;
  }
  return Response.json({
    metrics,
    bridge,
    ops,
    health: ops?.health ?? null,
    alerts,
    capabilities: listScheduleCapabilities(),
    generatedAt: new Date().toISOString(),
  });
}
