import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { evaluateWorkQueueAlerts } from "@/lib/work-queue/alerts";
import {
  INFRASTRUCTURE_CRON_SOT,
  PRODUCTION_PRESET_TYPES,
} from "@/lib/work-queue/cron-sot";
import { buildDurabilitySnapshot } from "@/lib/work-queue/durability";

export async function GET(): Promise<Response> {
  try {
    await requireAtlasOwner();
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const snapshot = await buildDurabilitySnapshot();
  const alerts = await evaluateWorkQueueAlerts();
  return Response.json({
    snapshot,
    alerts,
    cronSot: {
      infrastructure: INFRASTRUCTURE_CRON_SOT,
      productPresets: PRODUCTION_PRESET_TYPES,
    },
    generatedAt: snapshot.generatedAt,
  });
}
