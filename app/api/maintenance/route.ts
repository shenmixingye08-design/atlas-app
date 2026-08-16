import { ensureMaintenanceHydrated } from "@/lib/owner/system-status/maintenance-durable";
import { getMaintenanceModeConfig } from "@/lib/owner/system-status/maintenance";

export async function GET(): Promise<Response> {
  await ensureMaintenanceHydrated();
  return Response.json(getMaintenanceModeConfig(), {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
