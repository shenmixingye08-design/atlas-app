import { requireAtlasOwnerApi } from "@/lib/auth/require-atlas-owner";
import { getCostRankingSnapshot } from "@/lib/owner/cost-ranking/service";

export async function GET(): Promise<Response> {
  const owner = await requireAtlasOwnerApi();
  if (!owner.ok) return owner.response;
  return Response.json(getCostRankingSnapshot());
}
