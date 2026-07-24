import {
  createProfile,
  listProfiles,
} from "@/lib/business-profile";
import { parseCreateProfileBody } from "@/lib/business-profile/validation";

import {
  readJsonBody,
  requireUserId,
  unknownErrorResponse,
  validationErrorResponse,
} from "../business-profile-utils";

export async function GET(): Promise<Response> {
  const auth = await requireUserId();
  if (!auth.ok) return auth.response;

  const profiles = await listProfiles(auth.userId);
  return Response.json({ profiles });
}

export async function POST(request: Request): Promise<Response> {
  const auth = await requireUserId();
  if (!auth.ok) return auth.response;

  const json = await readJsonBody(request);
  if (!json.ok) return json.response;

  const parsed = parseCreateProfileBody(json.body);
  if (!parsed.ok) return validationErrorResponse(parsed);

  try {
    const profile = await createProfile(auth.userId, parsed.data);
    return Response.json({ profile }, { status: 201 });
  } catch (error) {
    return unknownErrorResponse(error, "/api/business-profiles");
  }
}
