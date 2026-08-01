import { auth } from "@clerk/nextjs/server";

import { appendArtifactRevision } from "@/lib/artifact-registry/registry";
import { assertArtifactAccess } from "@/lib/storage/authz";
import { inspectArtifactIntegrity } from "@/lib/storage/integrity-matrix";
import type { ArtifactKind } from "@/lib/artifact-registry/types";
import { getStoredDeliverableForUser } from "@/lib/deliverables/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Create a NEW revision from a parent artifact. Never overwrites the parent.
 * Body: { bufferBase64, fileName, kind?, revisionReason? }
 */
export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: parentId } = await context.params;
  const access = await assertArtifactAccess({
    artifactId: parentId,
    requesterId: userId,
    action: "revision",
  });
  if (!access.ok) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const bufferBase64 =
    body &&
    typeof body === "object" &&
    typeof (body as { bufferBase64?: unknown }).bufferBase64 === "string"
      ? (body as { bufferBase64: string }).bufferBase64
      : "";
  const fileName =
    body &&
    typeof body === "object" &&
    typeof (body as { fileName?: unknown }).fileName === "string"
      ? (body as { fileName: string }).fileName
      : "";
  const kind =
    body &&
    typeof body === "object" &&
    typeof (body as { kind?: unknown }).kind === "string"
      ? ((body as { kind: string }).kind as ArtifactKind)
      : undefined;
  const revisionReason =
    body &&
    typeof body === "object" &&
    typeof (body as { revisionReason?: unknown }).revisionReason === "string"
      ? (body as { revisionReason: string }).revisionReason
      : "edit";

  if (!bufferBase64 || !fileName) {
    return Response.json(
      { error: "bufferBase64 and fileName are required" },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(bufferBase64, "base64");
  if (buffer.byteLength === 0) {
    return Response.json({ error: "empty_buffer" }, { status: 400 });
  }

  const parent = await getStoredDeliverableForUser(parentId, userId);
  if (!parent) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const resolvedKind =
    kind ??
    (parent.format as ArtifactKind);

  const integrity = inspectArtifactIntegrity({
    buffer,
    kind: resolvedKind,
  });
  if (!integrity.ok && resolvedKind !== "txt" && resolvedKind !== "md") {
    return Response.json(
      {
        error: "integrity_failed",
        issues: integrity.issues,
      },
      { status: 422 },
    );
  }

  try {
    const { stored, identity } = await appendArtifactRevision({
      parentArtifactId: parentId,
      ownerId: userId,
      buffer,
      fileName,
      mimeType: storedMime(resolvedKind, parent.mimeType),
      kind: resolvedKind,
      revisionReason,
      sourceContent: parent.sourceContent,
    });

    // Parent must still exist unchanged
    const parentAfter = await getStoredDeliverableForUser(parentId, userId);
    if (!parentAfter || parentAfter.id === stored.id) {
      return Response.json({ error: "parent_lost" }, { status: 500 });
    }

    return Response.json(
      {
        ok: true,
        artifact: identity,
        parentArtifactId: parentId,
        downloadUrl: `/api/deliverables/${stored.id}`,
        previewUrl: `/api/deliverables/${stored.id}/preview`,
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "revision_failed";
    const status = message === "parent_not_found" ? 404 : 400;
    return Response.json({ error: message }, { status });
  }
}

function storedMime(kind: ArtifactKind, fallback: string): string {
  switch (kind) {
    case "csv":
      return "text/csv; charset=utf-8";
    case "image":
      return "image/png";
    default:
      return fallback;
  }
}
