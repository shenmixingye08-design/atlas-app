import {
  createCase,
  listCases,
} from "@/lib/business-profile/cases/service";
import { parseCreateCaseBody } from "@/lib/business-profile/validation";

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

  const cases = await listCases(auth.userId, parseNullableProfileFilter(request));
  return Response.json({ cases });
}

export async function POST(request: Request): Promise<Response> {
  const auth = await requireUserId();
  if (!auth.ok) return auth.response;

  const json = await readJsonBody(request);
  if (!json.ok) return json.response;

  const parsed = parseCreateCaseBody(json.body);
  if (!parsed.ok) return validationErrorResponse(parsed);

  try {
    const businessCase = await createCase(auth.userId, parsed.data);
    if (!businessCase) {
      return Response.json({ error: "Profile not found" }, { status: 409 });
    }
    return Response.json({ case: businessCase }, { status: 201 });
  } catch (error) {
    return unknownErrorResponse(error, "/api/business-cases");
  }
}
