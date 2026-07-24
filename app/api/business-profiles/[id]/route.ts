import {
  getProfileForUser,
  softDeleteProfile,
  updateProfile,
} from "@/lib/business-profile";
import { parseUpdateProfileBody } from "@/lib/business-profile/validation";

import {
  asOptionalString,
  isRecord,
  readJsonBody,
  requireUserId,
  type RouteContext,
  unknownErrorResponse,
  validationErrorResponse,
} from "../../business-profile-utils";

export async function GET(
  _request: Request,
  context: RouteContext<{ id: string }>,
): Promise<Response> {
  const auth = await requireUserId();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const profile = await getProfileForUser(auth.userId, id);
  if (!profile) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json({ profile });
}

export async function PATCH(
  request: Request,
  context: RouteContext<{ id: string }>,
): Promise<Response> {
  const auth = await requireUserId();
  if (!auth.ok) return auth.response;

  const json = await readJsonBody(request);
  if (!json.ok) return json.response;

  const parsed = parseUpdateProfileBody(json.body);
  if (!parsed.ok) return validationErrorResponse(parsed);

  const { id } = await context.params;
  try {
    const profile = await updateProfile(auth.userId, id, parsed.data);
    if (!profile) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ profile });
  } catch (error) {
    return unknownErrorResponse(error, "/api/business-profiles/[id]");
  }
}

export async function DELETE(
  request: Request,
  context: RouteContext<{ id: string }>,
): Promise<Response> {
  const auth = await requireUserId();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  let switchToProfileId: string | null | undefined;

  try {
    const body = await request.json();
    if (isRecord(body)) {
      switchToProfileId = asOptionalString(body.switchToProfileId);
    }
  } catch {
    switchToProfileId = undefined;
  }

  try {
    const deleted = await softDeleteProfile(auth.userId, id, { switchToProfileId });
    if (!deleted) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    return unknownErrorResponse(error, "/api/business-profiles/[id]");
  }
}
