import { auth } from "@clerk/nextjs/server";

import { getStoredDeliverableForUser } from "@/lib/deliverables/store";
import { assertArtifactAccess, assertSignedUrlOwner } from "@/lib/storage/authz";
import { trackExpiredSignedUrl } from "@/lib/storage/cleanup";
import {
  createSignedDownloadToken,
  decodeSignedToken,
  encodeSignedToken,
  regenerateSignedDownloadToken,
  verifySignedDownloadToken,
} from "@/lib/storage/signed-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** Issue or regenerate a short-lived signed download token. */
export async function POST(
  request: Request,
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
    action: "signed_url",
  });
  if (!access.ok) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const stored = await getStoredDeliverableForUser(id, userId);
  if (!stored) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  let regenerateFrom: string | null = null;
  try {
    const body = (await request.json()) as { token?: string };
    regenerateFrom = body.token ?? null;
  } catch {
    regenerateFrom = null;
  }

  if (regenerateFrom) {
    const prev = decodeSignedToken(regenerateFrom);
    if (
      !prev ||
      !assertSignedUrlOwner({
        tokenOwnerId: prev.ownerId,
        artifactOwnerId: stored.userId,
      })
    ) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    const next = regenerateSignedDownloadToken(prev);
    trackExpiredSignedUrl(encodeSignedToken(prev), prev.exp);
    return Response.json({
      ok: true,
      token: encodeSignedToken(next),
      expiresAt: new Date(next.exp).toISOString(),
      artifactId: id,
    });
  }

  const token = createSignedDownloadToken({
    artifactId: id,
    ownerId: userId,
  });
  return Response.json({
    ok: true,
    token: encodeSignedToken(token),
    expiresAt: new Date(token.exp).toISOString(),
    artifactId: id,
  });
}

/** Verify a signed token (does not stream file — download uses session AuthZ). */
export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const { id } = await context.params;
  const raw = new URL(request.url).searchParams.get("token");
  if (!raw) {
    return Response.json({ error: "token_required" }, { status: 400 });
  }
  const token = decodeSignedToken(raw);
  if (!token || token.artifactId !== id) {
    return Response.json({ error: "invalid_token" }, { status: 404 });
  }
  const verified = verifySignedDownloadToken(token);
  if (!verified.ok) {
    return Response.json(
      {
        ok: false,
        reason: verified.reason,
        expired: verified.reason === "expired",
      },
      { status: 401 },
    );
  }
  return Response.json({
    ok: true,
    artifactId: token.artifactId,
    ownerId: token.ownerId,
    expiresAt: new Date(token.exp).toISOString(),
  });
}
