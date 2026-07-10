import { getMaintenanceModeConfig } from "@/lib/owner/system-status/maintenance";

export async function GET(): Promise<Response> {
  return Response.json(getMaintenanceModeConfig(), {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
