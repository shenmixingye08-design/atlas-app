import { requireAtlasOwnerApi } from "@/lib/auth/require-atlas-owner";
import { getAnonymousUserAnalysisSnapshot } from "@/lib/owner/anonymous-user-analysis/service";

export async function GET(): Promise<Response> {
  const owner = await requireAtlasOwnerApi();
  if (!owner.ok) return owner.response;
  return Response.json(getAnonymousUserAnalysisSnapshot());
}
