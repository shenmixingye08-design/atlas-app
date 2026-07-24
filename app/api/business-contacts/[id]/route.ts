import {
  getContactForUser,
  softDeleteContact,
  updateContact,
} from "@/lib/business-profile/contacts/service";
import { parseUpdateContactBody } from "@/lib/business-profile/validation";

import {
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
  const contact = await getContactForUser(auth.userId, id);
  if (!contact) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ contact });
}

export async function PATCH(
  request: Request,
  context: RouteContext<{ id: string }>,
): Promise<Response> {
  const auth = await requireUserId();
  if (!auth.ok) return auth.response;

  const json = await readJsonBody(request);
  if (!json.ok) return json.response;

  const parsed = parseUpdateContactBody(json.body);
  if (!parsed.ok) return validationErrorResponse(parsed);

  const { id } = await context.params;
  try {
    const contact = await updateContact(auth.userId, id, parsed.data);
    if (!contact) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ contact });
  } catch (error) {
    return unknownErrorResponse(error, "/api/business-contacts/[id]");
  }
}

export async function DELETE(
  _request: Request,
  context: RouteContext<{ id: string }>,
): Promise<Response> {
  const auth = await requireUserId();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const deleted = await softDeleteContact(auth.userId, id);
  if (!deleted) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true });
}
