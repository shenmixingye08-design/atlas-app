import { requireAtlasOwnerApi } from "@/lib/auth/require-atlas-owner";
import { getCancellationAnalysisSnapshot } from "@/lib/owner/cancellation-analysis/service";

export async function GET(): Promise<Response> {
  const owner = await requireAtlasOwnerApi();
  if (!owner.ok) return owner.response;
  return Response.json(getCancellationAnalysisSnapshot());
}
