import {
  getCaseForUser,
  softDeleteCase,
  updateCase,
} from "@/lib/business-profile/cases/service";
import { parseUpdateCaseBody } from "@/lib/business-profile/validation";

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
  const businessCase = await getCaseForUser(auth.userId, id);
  if (!businessCase) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ case: businessCase });
}

export async function PATCH(
  request: Request,
  context: RouteContext<{ id: string }>,
): Promise<Response> {
  const auth = await requireUserId();
  if (!auth.ok) return auth.response;

  const json = await readJsonBody(request);
  if (!json.ok) return json.response;

  const parsed = parseUpdateCaseBody(json.body);
  if (!parsed.ok) return validationErrorResponse(parsed);

  const { id } = await context.params;
  try {
    const businessCase = await updateCase(auth.userId, id, parsed.data);
    if (!businessCase) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json({ case: businessCase });
  } catch (error) {
    return unknownErrorResponse(error, "/api/business-cases/[id]");
  }
}

export async function DELETE(
  _request: Request,
  context: RouteContext<{ id: string }>,
): Promise<Response> {
  const auth = await requireUserId();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const deleted = await softDeleteCase(auth.userId, id);
  if (!deleted) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true });
}
