import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { evaluateWorkQueueAlerts } from "@/lib/work-queue/alerts";
import { listScheduleCapabilities } from "@/lib/work-queue/capabilities";
import {
  INFRASTRUCTURE_CRON_SOT,
  PRODUCTION_PRESET_TYPES,
} from "@/lib/work-queue/cron-sot";
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
    cronSot: {
      infrastructure: INFRASTRUCTURE_CRON_SOT,
      productPresets: PRODUCTION_PRESET_TYPES,
    },
    generatedAt: new Date().toISOString(),
  });
}
