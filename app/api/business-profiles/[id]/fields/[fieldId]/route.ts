import {
  deleteField,
  listFields,
  upsertField,
} from "@/lib/business-profile";
import { parseCustomFieldBody } from "@/lib/business-profile/validation";

import {
  isRecord,
  readJsonBody,
  requireUserId,
  type RouteContext,
  unknownErrorResponse,
  validationErrorResponse,
} from "../../../../business-profile-utils";

async function resolveFieldKey(
  ownerUserId: string,
  profileId: string,
  fieldId: string,
): Promise<string | null> {
  const fields = await listFields(ownerUserId, profileId);
  const field = fields.find((item) => item.id === fieldId || item.key === fieldId);
  return field?.key ?? null;
}

export async function PATCH(
  request: Request,
  context: RouteContext<{ id: string; fieldId: string }>,
): Promise<Response> {
  const auth = await requireUserId();
  if (!auth.ok) return auth.response;

  const { id, fieldId } = await context.params;
  const fields = await listFields(auth.userId, id);
  const existing = fields.find((item) => item.id === fieldId || item.key === fieldId);
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  const json = await readJsonBody(request);
  if (!json.ok) return json.response;
  if (!isRecord(json.body)) {
    return Response.json({ error: "Request body must be an object" }, { status: 400 });
  }

  const baseField = {
    key: existing.key,
    label: existing.label,
    value: existing.value,
    valueType: existing.valueType,
    sensitivity: existing.sensitivity,
    usage: existing.usage,
    sourceDetail: existing.sourceDetail,
    sortOrder: existing.sortOrder,
  };
  const parsed = parseCustomFieldBody({
    ...baseField,
    ...json.body,
    key: existing.key,
  });
  if (!parsed.ok) return validationErrorResponse(parsed);

  try {
    const field = await upsertField(auth.userId, id, parsed.data);
    if (!field) return Response.json({ error: "Profile not found" }, { status: 404 });
    return Response.json({ field });
  } catch (error) {
    return unknownErrorResponse(error, "/api/business-profiles/[id]/fields/[fieldId]");
  }
}

export async function DELETE(
  _request: Request,
  context: RouteContext<{ id: string; fieldId: string }>,
): Promise<Response> {
  const auth = await requireUserId();
  if (!auth.ok) return auth.response;

  const { id, fieldId } = await context.params;
  const fieldKey = await resolveFieldKey(auth.userId, id, fieldId);
  if (!fieldKey) return Response.json({ error: "Not found" }, { status: 404 });

  const deleted = await deleteField(auth.userId, id, fieldKey);
  if (!deleted) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true });
}
