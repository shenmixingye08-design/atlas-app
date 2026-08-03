import { auth } from "@clerk/nextjs/server";

import { assertArtifactAccess } from "@/lib/storage/authz";
import { softDeleteArtifact } from "@/lib/storage/cleanup";
import { getStoredDeliverableForUser } from "@/lib/deliverables/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** Soft-delete an owned artifact. Cross-user always 404. */
export async function POST(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const access = await assertArtifactAccess({
    artifactId: id,
    requesterId: userId,
    action: "delete",
  });
  if (!access.ok) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const stored = await getStoredDeliverableForUser(id, userId);
  if (!stored) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  softDeleteArtifact(id, "user_delete");
  return Response.json({ ok: true, artifactId: id, status: "deleted" });
}
