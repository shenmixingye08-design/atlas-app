import { requireAtlasOwnerApi } from "@/lib/auth/require-atlas-owner";
import { getOwnerDashboardSnapshot } from "@/lib/owner/service";

export async function GET(): Promise<Response> {
  const owner = await requireAtlasOwnerApi();
  if (!owner.ok) return owner.response;

  const snapshot = await getOwnerDashboardSnapshot();
  return Response.json(snapshot);
}
