import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { uploadWordPressMediaForUser } from "@/lib/integrations/wordpress/post/service";

/** Upload a remote image as WordPress media (for featured image). */
export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { status: "error", message: "Unauthorized" },
      { status: 401 },
    );
  }

  const context = await resolveFeatureAccessContext();

  let body: { imageUrl?: string; altText?: string; filename?: string };
  try {
    body = (await request.json()) as {
      imageUrl?: string;
      altText?: string;
      filename?: string;
    };
  } catch {
    return Response.json(
      { status: "validation_failed", message: "リクエスト本文が不正です" },
      { status: 400 },
    );
  }

  if (!body.imageUrl?.trim()) {
    return Response.json(
      {
        status: "validation_failed",
        message: "画像URLを指定してください",
      },
      { status: 400 },
    );
  }

  const result = await uploadWordPressMediaForUser({
    userId,
    context,
    imageUrl: body.imageUrl.trim(),
    altText: body.altText,
    filename: body.filename,
  });

  if (result.status === "ok") {
    return Response.json(result);
  }
  if (result.status === "feature_disabled") {
    return Response.json(result, { status: 403 });
  }
  if (result.status === "wp_not_connected" || result.status === "auth_failure") {
    return Response.json(result, { status: 409 });
  }
  if (
    result.status === "durable_unavailable" ||
    result.status === "configuration_error"
  ) {
    return Response.json(result, { status: 503 });
  }
  return Response.json(result, { status: 502 });
}
