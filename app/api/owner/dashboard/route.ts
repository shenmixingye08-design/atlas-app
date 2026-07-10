import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { getOwnerDashboardSnapshot } from "@/lib/owner/service";

export async function GET(): Promise<Response> {
  await requireAtlasOwner();

  const snapshot = await getOwnerDashboardSnapshot();
  return Response.json(snapshot);
}
