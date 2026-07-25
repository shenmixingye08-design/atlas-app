import { setDefaultProfile } from "@/lib/business-profile";

import {
  requireUserId,
  type RouteContext,
  unknownErrorResponse,
} from "../../../business-profile-utils";

export async function POST(
  _request: Request,
  context: RouteContext<{ id: string }>,
): Promise<Response> {
  const auth = await requireUserId();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  try {
    const profile = await setDefaultProfile(auth.userId, id);
    if (!profile) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ profile });
  } catch (error) {
    return unknownErrorResponse(error, "/api/business-profiles/[id]/default");
  }
}
