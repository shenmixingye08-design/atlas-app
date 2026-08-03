import { auth } from "@clerk/nextjs/server";

import { getStoredDeliverableForUser } from "@/lib/deliverables/store";
import { assertArtifactAccess } from "@/lib/storage/authz";
import { buildArtifactPreview } from "@/lib/storage/preview";
import { isSoftDeleted } from "@/lib/storage/cleanup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * Multi-format preview (Word / Excel / PDF / PowerPoint / CSV / image).
 * Preview failure never blocks download — downloadAvailable is always true.
 */
export async function GET(
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
    action: "preview",
  });
  if (!access.ok) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  if (isSoftDeleted(id)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const stored = await getStoredDeliverableForUser(id, userId);
  if (!stored) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const result = buildArtifactPreview(stored);
  if (!result.ok) {
    return Response.json(
      {
        ok: false,
        error: result.error,
        errorCode: result.errorCode,
        downloadAvailable: true,
        retryable: result.retryable,
        kind: result.kind,
        downloadUrl: `/api/deliverables/${id}`,
      },
      { status: 422 },
    );
  }

  return Response.json({
    ok: true,
    kind: result.kind,
    preview: result.preview,
    downloadAvailable: true,
    downloadUrl: `/api/deliverables/${id}`,
  });
}
