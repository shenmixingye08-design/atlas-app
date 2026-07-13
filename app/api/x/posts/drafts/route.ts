import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import {
  deleteXDraftForUser,
  getXDraftPostsForUser,
  saveXDraftForUser,
} from "@/lib/integrations/x/post/service";

type DraftBody = {
  text?: unknown;
  draftId?: unknown;
};

export async function GET(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { status: "unauthorized", message: "Unauthorized" },
      { status: 401 },
    );
  }

  const context = await resolveFeatureAccessContext();
  const result = await getXDraftPostsForUser({ userId, context });

  if (result.status !== "ready") {
    return Response.json(result, { status: 403 });
  }

  return Response.json(result);
}

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { status: "unauthorized", message: "Unauthorized" },
      { status: 401 },
    );
  }

  let body: DraftBody;
  try {
    body = (await request.json()) as DraftBody;
  } catch {
    return Response.json(
      { status: "error", message: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (typeof body.text !== "string" || !body.text.trim()) {
    return Response.json(
      { status: "error", message: "text is required" },
      { status: 400 },
    );
  }

  const draftId =
    typeof body.draftId === "string" && body.draftId.trim()
      ? body.draftId.trim()
      : undefined;

  const context = await resolveFeatureAccessContext();
  const result = await saveXDraftForUser({
    userId,
    text: body.text,
    draftId,
    context,
  });

  if (result.status === "feature_disabled") {
    return Response.json(result, { status: 403 });
  }
  if (result.status === "validation_failed") {
    return Response.json(result, { status: 422 });
  }
  if (result.status === "error") {
    return Response.json(result, { status: 500 });
  }

  return Response.json(result);
}

export async function DELETE(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { status: "unauthorized", message: "Unauthorized" },
      { status: 401 },
    );
  }

  const draftId = new URL(request.url).searchParams.get("id")?.trim();
  if (!draftId) {
    return Response.json(
      { status: "error", message: "id is required" },
      { status: 400 },
    );
  }

  const context = await resolveFeatureAccessContext();
  const result = await deleteXDraftForUser({
    userId,
    draftId,
    context,
  });

  if (result.status === "feature_disabled") {
    return Response.json(result, { status: 403 });
  }
  if (result.status === "not_found") {
    return Response.json(result, { status: 404 });
  }

  return Response.json(result);
}
