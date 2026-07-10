import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import {
  getErrorMonitoringSnapshot,
  parseErrorResolutionUpdate,
  updateErrorCategoryResolution,
} from "@/lib/owner/error-monitoring/service";

export async function GET(): Promise<Response> {
  await requireAtlasOwner();
  return Response.json(getErrorMonitoringSnapshot());
}

export async function PATCH(request: Request): Promise<Response> {
  await requireAtlasOwner();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseErrorResolutionUpdate(body);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const snapshot = updateErrorCategoryResolution(
    parsed.categoryId,
    parsed.resolutionStatus,
  );
  return Response.json(snapshot);
}
