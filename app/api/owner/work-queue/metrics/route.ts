import { requireAtlasOwnerApi } from "@/lib/auth/require-atlas-owner";
import { evaluateWorkQueueAlerts } from "@/lib/work-queue/alerts";
import { listScheduleCapabilities } from "@/lib/work-queue/capabilities";
import { getWorkQueueStore } from "@/lib/work-queue";

export async function GET(): Promise<Response> {
  const owner = await requireAtlasOwnerApi();
  if (!owner.ok) return owner.response;

  const metrics = await getWorkQueueStore().metrics();
  const alerts = await evaluateWorkQueueAlerts();
  return Response.json({
    metrics,
    alerts,
    capabilities: listScheduleCapabilities(),
    generatedAt: new Date().toISOString(),
  });
}
