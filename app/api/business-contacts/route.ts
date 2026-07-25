import {
  createContact,
  listContacts,
} from "@/lib/business-profile/contacts/service";
import { parseCreateContactBody } from "@/lib/business-profile/validation";

import {
  parseNullableProfileFilter,
  readJsonBody,
  requireUserId,
  unknownErrorResponse,
  validationErrorResponse,
} from "../business-profile-utils";

export async function GET(request: Request): Promise<Response> {
  const auth = await requireUserId();
  if (!auth.ok) return auth.response;

  const contacts = await listContacts(
    auth.userId,
    parseNullableProfileFilter(request),
  );
  return Response.json({ contacts });
}

export async function POST(request: Request): Promise<Response> {
  const auth = await requireUserId();
  if (!auth.ok) return auth.response;

  const json = await readJsonBody(request);
  if (!json.ok) return json.response;

  const parsed = parseCreateContactBody(json.body);
  if (!parsed.ok) return validationErrorResponse(parsed);

  try {
    const contact = await createContact(auth.userId, parsed.data);
    if (!contact) {
      return Response.json({ error: "Profile not found" }, { status: 409 });
    }
    return Response.json({ contact }, { status: 201 });
  } catch (error) {
    return unknownErrorResponse(error, "/api/business-contacts");
  }
}
