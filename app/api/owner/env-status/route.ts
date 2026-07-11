import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { getOwnerEnvStatusSnapshot } from "@/lib/owner/env-status";

export async function GET(): Promise<Response> {
  await requireAtlasOwner();
  return Response.json(getOwnerEnvStatusSnapshot());
}
