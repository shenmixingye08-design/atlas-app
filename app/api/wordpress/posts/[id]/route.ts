import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { updateWordPressPostForUser } from "@/lib/integrations/wordpress/post/service";
import type { WordPressPostPayload } from "@/lib/integrations/wordpress/types";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function statusCodeForResult(status: string): number {
  switch (status) {
    case "updated":
      return 200;
    case "feature_disabled":
      return 403;
    case "wp_not_connected":
    case "auth_failure":
      return 409;
    case "validation_failed":
      return 400;
    default:
      return 502;
  }
}

/** Update an existing WordPress post (draft/publish/content/featured image). */
export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { status: "error", message: "Unauthorized" },
      { status: 401 },
    );
  }

  const { id } = await context.params;
  const postId = Number(id);
  if (!Number.isFinite(postId) || postId <= 0) {
    return Response.json(
      { status: "validation_failed", message: "有効な記事IDを指定してください" },
      { status: 400 },
    );
  }

  let payload: WordPressPostPayload;
  try {
    payload = (await request.json()) as WordPressPostPayload;
  } catch {
    return Response.json(
      { status: "validation_failed", message: "リクエスト本文が不正です" },
      { status: 400 },
    );
  }

  const accessContext = await resolveFeatureAccessContext();
  const result = await updateWordPressPostForUser({
    userId,
    context: accessContext,
    postId,
    payload,
  });

  return Response.json(result, { status: statusCodeForResult(result.status) });
}
