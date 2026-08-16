import { requireAtlasOwnerApi } from "@/lib/auth/require-atlas-owner";
import {
  applyBetaUserPatchForOwner,
  getBetaUserManagementSnapshotForOwner,
  parseBetaUserPatchBody,
} from "@/lib/owner/beta-users/service";
import { clientSafeMessage } from "@/lib/security/client-safe-message";

export async function GET(): Promise<Response> {
  const owner = await requireAtlasOwnerApi();
  if (!owner.ok) return owner.response;
  return Response.json(await getBetaUserManagementSnapshotForOwner());
}

export async function PATCH(request: Request): Promise<Response> {
  const owner = await requireAtlasOwnerApi();
  if (!owner.ok) return owner.response;

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
    const result = await applyBetaUserPatchForOwner(parsed);
    if ("error" in result) {
      return Response.json({ error: result.error }, { status: result.status });
    }
    return Response.json(result.snapshot);
  } catch (error) {
    const message = clientSafeMessage(error, "Failed to update beta user");
    return Response.json({ error: message }, { status: 400 });
  }
}
