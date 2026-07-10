import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { getPopularityRankingSnapshot } from "@/lib/owner/popularity-ranking/service";

export async function GET(): Promise<Response> {
  await requireAtlasOwner();
  return Response.json(getPopularityRankingSnapshot());
}
