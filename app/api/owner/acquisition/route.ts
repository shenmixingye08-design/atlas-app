import { requireAtlasOwnerApi } from "@/lib/auth/require-atlas-owner";
import {
  getOwnerAcquisitionSnapshot,
  handleOwnerAcquisitionAction,
} from "@/lib/growth/acquisition/service";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const owner = await requireAtlasOwnerApi();
  if (!owner.ok) return owner.response;
  return Response.json(await getOwnerAcquisitionSnapshot());
}

export async function POST(request: Request): Promise<Response> {
  const owner = await requireAtlasOwnerApi();
  if (!owner.ok) return owner.response;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const result = await handleOwnerAcquisitionAction(body);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  return Response.json({ ...result, appliedStripe: false });
}
