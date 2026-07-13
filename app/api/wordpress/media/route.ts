import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { isFeatureEnabled } from "@/lib/feature-flags/access";
import { featureDisabledMessage } from "@/lib/feature-flags/guards";
import { ensureExternalAuthHydrated } from "@/lib/integrations/external-services/durable";
import {
  WordPressApiError,
  uploadWordPressMediaFromUrl,
} from "@/lib/integrations/wordpress/api-client";
import {
  getWordPressAuthContext,
  markWordPressAuthFailure,
  touchWordPressConnectionLastUsed,
} from "@/lib/integrations/wordpress/connection-service";
import {
  WP_AUTH_FAILURE_MESSAGE,
  WP_NOT_CONNECTED_MESSAGE,
} from "@/lib/integrations/wordpress/errors";

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
  if (!isFeatureEnabled("wordpress", context)) {
    return Response.json(
      {
        status: "feature_disabled",
        message: featureDisabledMessage("wordpress"),
      },
      { status: 403 },
    );
  }

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

  await ensureExternalAuthHydrated(userId);
  const authCtx = getWordPressAuthContext(userId);
  if (!authCtx) {
    return Response.json(
      { status: "wp_not_connected", message: WP_NOT_CONNECTED_MESSAGE },
      { status: 409 },
    );
  }

  try {
    const media = await uploadWordPressMediaFromUrl({
      auth: authCtx,
      imageUrl: body.imageUrl.trim(),
      altText: body.altText,
      filename: body.filename,
    });
    await touchWordPressConnectionLastUsed(userId);
    return Response.json({
      status: "ok",
      media: {
        id: media.id,
        sourceUrl: media.sourceUrl,
        altText: media.altText,
      },
    });
  } catch (error) {
    if (error instanceof WordPressApiError && error.isAuthFailure) {
      await markWordPressAuthFailure(userId);
      return Response.json(
        { status: "auth_failure", message: WP_AUTH_FAILURE_MESSAGE },
        { status: 409 },
      );
    }
    return Response.json(
      {
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "メディアのアップロードに失敗しました",
      },
      { status: 502 },
    );
  }
}
