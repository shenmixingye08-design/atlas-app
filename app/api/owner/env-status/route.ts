import { requireAtlasOwnerApi } from "@/lib/auth/require-atlas-owner";
import { getOwnerEnvStatusSnapshot } from "@/lib/owner/env-status";

export async function GET(): Promise<Response> {
  const owner = await requireAtlasOwnerApi();
  if (!owner.ok) return owner.response;
  return Response.json(getOwnerEnvStatusSnapshot());
}
