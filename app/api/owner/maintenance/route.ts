import { requireAtlasOwnerApi } from "@/lib/auth/require-atlas-owner";
import { parseMaintenancePatchBody } from "@/lib/owner/system-status/maintenance";
import {
  getMaintenanceModeConfigForOwner,
  updateMaintenanceModeForOwner,
} from "@/lib/owner/system-status/maintenance-service";

export async function GET(): Promise<Response> {
  const owner = await requireAtlasOwnerApi();
  if (!owner.ok) return owner.response;
  return Response.json(await getMaintenanceModeConfigForOwner());
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

  const parsed = parseMaintenancePatchBody(body);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const result = await updateMaintenanceModeForOwner(parsed);
  if ("error" in result) {
    return Response.json({ error: result.error }, { status: result.status });
  }
  return Response.json(result.config);
}
