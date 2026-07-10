import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import {
  getFeatureFlagSnapshot,
  parseFeatureFlagUpdateBody,
  updateFeatureFlagState,
} from "@/lib/feature-flags/service";

export async function GET(): Promise<Response> {
  await requireAtlasOwner();
  return Response.json(getFeatureFlagSnapshot());
}

export async function PATCH(request: Request): Promise<Response> {
  await requireAtlasOwner();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseFeatureFlagUpdateBody(body);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const snapshot = updateFeatureFlagState(parsed.id, parsed.state);
  return Response.json(snapshot);
}
