import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { getCostRankingSnapshot } from "@/lib/owner/cost-ranking/service";

export async function GET(): Promise<Response> {
  await requireAtlasOwner();
  return Response.json(getCostRankingSnapshot());
}
