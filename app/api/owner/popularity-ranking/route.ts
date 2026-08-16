import { requireAtlasOwnerApi } from "@/lib/auth/require-atlas-owner";
import { getPopularityRankingSnapshot } from "@/lib/owner/popularity-ranking/service";

export async function GET(): Promise<Response> {
  const owner = await requireAtlasOwnerApi();
  if (!owner.ok) return owner.response;
  return Response.json(getPopularityRankingSnapshot());
}
