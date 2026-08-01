import { auth, currentUser } from "@clerk/nextjs/server";

import { getStoredDeliverableForUser } from "@/lib/deliverables/store";
import {
  findVersionGroupByDeliverableIdAsync,
  listDeliverableVersionsAsync,
} from "@/lib/deliverables/versioning";
import {
  assertArtifactAccess,
  artifactAccessDeniedResponse,
} from "@/lib/security/artifact/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    null;
  const stored = await getStoredDeliverableForUser(id, userId);
  const access = assertArtifactAccess({
    actorUserId: userId,
    actorEmail: email,
    artifactOwnerUserId: stored?.userId ?? null,
    op: "revision",
    artifactId: id,
    ip:
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip"),
  });
  if (!access.allowed) {
    return artifactAccessDeniedResponse(access);
  }
  if (!stored) {
    return Response.json(
      { error: "Not found", request_id: access.request_id },
      { status: 404 },
    );
  }

  const group = await findVersionGroupByDeliverableIdAsync(stored.id);
  if (!group) {
    return Response.json({ groupId: null, versions: [] });
  }

  const versions = await listDeliverableVersionsAsync(group.groupId);
  return Response.json({
    groupId: group.groupId,
    currentDeliverableId: stored.id,
    versions: versions.map((version) => ({
      deliverableId: version.deliverableId,
      parentDeliverableId: version.parentDeliverableId,
      version: version.version,
      isLatest: version.isLatest,
      revisionReason: version.revisionReason,
      createdAt: version.createdAt,
      displayName: version.displayName,
      internalFileName: version.internalFileName,
      downloadUrl: `/api/deliverables/${version.deliverableId}`,
      previewUrl: `/api/deliverables/${version.deliverableId}/preview`,
    })),
  });
}
