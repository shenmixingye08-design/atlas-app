import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
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
  return Response.json({
    metrics,
    alerts,
    capabilities: listScheduleCapabilities(),
    generatedAt: new Date().toISOString(),
  });
}
