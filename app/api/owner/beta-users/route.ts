import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import {
  applyBetaUserPatch,
  getBetaUserManagementSnapshot,
  parseBetaUserPatchBody,
} from "@/lib/owner/beta-users/service";

export async function GET(): Promise<Response> {
  await requireAtlasOwner();
  return Response.json(getBetaUserManagementSnapshot());
}

export async function PATCH(request: Request): Promise<Response> {
  await requireAtlasOwner();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseBetaUserPatchBody(body);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  try {
    return Response.json(applyBetaUserPatch(parsed));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update beta user";
    return Response.json({ error: message }, { status: 400 });
  }
}
