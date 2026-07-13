import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { createWordPressPostForUser } from "@/lib/integrations/wordpress/post/service";
import type { WordPressPostPayload } from "@/lib/integrations/wordpress/types";

function statusCodeForResult(status: string): number {
  switch (status) {
    case "posted":
    case "draft_saved":
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

/** Create draft or publish a WordPress post for the authenticated user. */
export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { status: "error", message: "Unauthorized" },
      { status: 401 },
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

  const context = await resolveFeatureAccessContext();
  const result = await createWordPressPostForUser({
    userId,
    context,
    payload,
  });

  return Response.json(result, { status: statusCodeForResult(result.status) });
}
