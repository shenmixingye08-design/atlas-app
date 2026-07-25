import { purgeBusinessProfileData } from "@/lib/business-profile";

import {
  isRecord,
  readJsonBody,
  requireUserId,
  unknownErrorResponse,
} from "../../business-profile-utils";

export async function POST(request: Request): Promise<Response> {
  const auth = await requireUserId();
  if (!auth.ok) return auth.response;

  const json = await readJsonBody(request);
  if (!json.ok) return json.response;
  if (!isRecord(json.body) || json.body.confirm !== "DELETE") {
    return Response.json(
      { error: "Type DELETE to purge business profile data." },
      { status: 400 },
    );
  }

  try {
    const counts = await purgeBusinessProfileData(auth.userId);
    return Response.json({ ok: true, counts });
  } catch (error) {
    return unknownErrorResponse(error, "/api/business-profiles/purge");
  }
}
