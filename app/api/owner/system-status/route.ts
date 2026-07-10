import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import {
  applySystemStatusPatch,
  getSystemStatusSnapshot,
  parseSystemStatusPatchBody,
} from "@/lib/owner/system-status/service";

export async function GET(): Promise<Response> {
  await requireAtlasOwner();
  return Response.json(getSystemStatusSnapshot());
}

export async function PATCH(request: Request): Promise<Response> {
  await requireAtlasOwner();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseSystemStatusPatchBody(body);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  return Response.json(applySystemStatusPatch(parsed));
}
