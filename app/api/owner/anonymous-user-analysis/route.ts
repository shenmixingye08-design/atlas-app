import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { getAnonymousUserAnalysisSnapshot } from "@/lib/owner/anonymous-user-analysis/service";

export async function GET(): Promise<Response> {
  await requireAtlasOwner();
  return Response.json(getAnonymousUserAnalysisSnapshot());
}
