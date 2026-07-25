import {
  listFields,
  upsertField,
} from "@/lib/business-profile";
import { parseCustomFieldBody } from "@/lib/business-profile/validation";

import {
  readJsonBody,
  requireUserId,
  type RouteContext,
  unknownErrorResponse,
  validationErrorResponse,
} from "../../../business-profile-utils";

export async function GET(
  _request: Request,
  context: RouteContext<{ id: string }>,
): Promise<Response> {
  const auth = await requireUserId();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const fields = await listFields(auth.userId, id);
  return Response.json({ fields });
}

export async function POST(
  request: Request,
  context: RouteContext<{ id: string }>,
): Promise<Response> {
  const auth = await requireUserId();
  if (!auth.ok) return auth.response;

  const json = await readJsonBody(request);
  if (!json.ok) return json.response;

  const parsed = parseCustomFieldBody(json.body);
  if (!parsed.ok) return validationErrorResponse(parsed);

  const { id } = await context.params;
  try {
    const field = await upsertField(auth.userId, id, parsed.data);
    if (!field) return Response.json({ error: "Profile not found" }, { status: 404 });
    return Response.json({ field }, { status: 201 });
  } catch (error) {
    return unknownErrorResponse(error, "/api/business-profiles/[id]/fields");
  }
}
