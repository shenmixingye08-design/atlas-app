import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { getCancellationAnalysisSnapshot } from "@/lib/owner/cancellation-analysis/service";

export async function GET(): Promise<Response> {
  await requireAtlasOwner();
  return Response.json(getCancellationAnalysisSnapshot());
}
