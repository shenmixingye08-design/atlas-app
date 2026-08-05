import "server-only";

import { isFeatureEnabled } from "@/lib/feature-flags/access";
import type { FeatureAccessContext } from "@/lib/feature-flags/types";
import { featureDisabledMessage } from "@/lib/feature-flags/guards";
import { buildIdempotencyKey } from "@/lib/integrations/production/idempotency";
import { runIntegrationAction } from "@/lib/integrations/production/execute";

import { ensureExternalAuthHydrated } from "../../external-services/durable";
import { getExternalServiceConnection } from "../../external-services/store";
import {
  WordPressApiError,
  createWordPressPost,
  listWordPressCategories,
  listWordPressTags,
  updateWordPressPost,
  uploadWordPressMediaFromUrl,
} from "../api-client";
import {
  getWordPressAuthContext,
  markWordPressAuthFailure,
  touchWordPressConnectionLastUsed,
} from "../connection-service";
import {
  WP_AUTH_FAILURE_MESSAGE,
  WP_NOT_CONNECTED_MESSAGE,
} from "../errors";
import type {
  WordPressCategory,
  WordPressPostPayload,
  WordPressPostResult,
  WordPressTag,
} from "../types";

function requireAuth(userId: string) {
  const auth = getWordPressAuthContext(userId);
  const connection = getExternalServiceConnection(userId, "wordpress");
  if (!auth || connection.status === "disconnected") {
    return null;
  }
  return { auth, connection };
}

function mapAuthError(error: unknown): WordPressPostResult {
  if (error instanceof WordPressApiError && error.isAuthFailure) {
    return {
      status: "auth_failure",
      message: WP_AUTH_FAILURE_MESSAGE,
    };
  }
  return {
    status: "error",
    message:
      error instanceof Error ? error.message : "WordPressへの投稿に失敗しました",
  };
}

function buildPostBody(payload: WordPressPostPayload, featuredMediaId?: number) {
  const body: Record<string, unknown> = {
    title: payload.title,
    content: payload.content,
    status: payload.status ?? "draft",
  };
  if (payload.excerpt) body.excerpt = payload.excerpt;
  if (payload.categories?.length) body.categories = payload.categories;
  if (payload.tags?.length) body.tags = payload.tags;
  const mediaId = featuredMediaId ?? payload.featuredMediaId;
  if (typeof mediaId === "number" && mediaId > 0) {
    body.featured_media = mediaId;
  }
  if (payload.seoSlug?.trim()) {
    body.slug = payload.seoSlug.trim();
  }

  const meta: Record<string, string> = {};
  if (payload.seoTitle?.trim()) {
    meta._yoast_wpseo_title = payload.seoTitle.trim();
    meta.atlas_seo_title = payload.seoTitle.trim();
  }
  if (payload.seoDescription?.trim()) {
    meta._yoast_wpseo_metadesc = payload.seoDescription.trim();
    meta.atlas_seo_description = payload.seoDescription.trim();
  }
  if (Object.keys(meta).length > 0) {
    body.meta = meta;
  }
  return body;
}

async function resolveFeaturedMediaId(
  userId: string,
  payload: WordPressPostPayload,
): Promise<number | undefined> {
  if (typeof payload.featuredMediaId === "number" && payload.featuredMediaId > 0) {
    return payload.featuredMediaId;
  }
  if (!payload.featuredImageUrl?.trim()) return undefined;

  const ctx = requireAuth(userId);
  if (!ctx) return undefined;

  const media = await uploadWordPressMediaFromUrl({
    auth: ctx.auth,
    imageUrl: payload.featuredImageUrl.trim(),
    altText: payload.featuredImageAlt,
  });
  return media.id;
}

export async function createWordPressPostForUser(input: {
  userId: string;
  context: FeatureAccessContext;
  payload: WordPressPostPayload;
}): Promise<WordPressPostResult> {
  if (!isFeatureEnabled("wordpress", input.context)) {
    return {
      status: "feature_disabled",
      message: featureDisabledMessage("wordpress"),
    };
  }

  const title = input.payload.title?.trim() ?? "";
  const content = input.payload.content?.trim() ?? "";
  if (!title || !content) {
    return {
      status: "validation_failed",
      message: "タイトルと本文を入力してください",
    };
  }

  await ensureExternalAuthHydrated(input.userId);
  const ctx = requireAuth(input.userId);
  if (!ctx) {
    return { status: "wp_not_connected", message: WP_NOT_CONNECTED_MESSAGE };
  }

  try {
    const featuredMediaId = await resolveFeaturedMediaId(
      input.userId,
      input.payload,
    );
    const status = input.payload.status ?? "draft";
    const body = buildPostBody(
      { ...input.payload, title, content, status },
      featuredMediaId,
    );
    const idempotencyKey = buildIdempotencyKey({
      integration: "wordpress",
      action: status === "publish" ? "publish" : "draft",
      userId: input.userId,
      fingerprint: JSON.stringify(body),
    });

    const executed = await runIntegrationAction(
      {
        integration: "wordpress",
        action: status === "publish" ? "publish" : "draft",
        userId: input.userId,
        idempotencyKey,
        preventDuplicate: true,
        maxAttempts: 3,
      },
      () => createWordPressPost(ctx.auth, body),
    );
    const created = executed.value;
    await touchWordPressConnectionLastUsed(input.userId);

    return {
      status: status === "publish" ? "posted" : "draft_saved",
      message:
        status === "publish"
          ? "WordPressに公開しました"
          : "WordPressに下書き保存しました",
      postId: created.id,
      link: created.link ?? null,
      postStatus: created.status,
    };
  } catch (error) {
    if (error instanceof WordPressApiError && error.isAuthFailure) {
      await markWordPressAuthFailure(input.userId);
    }
    return mapAuthError(error);
  }
}

export async function updateWordPressPostForUser(input: {
  userId: string;
  context: FeatureAccessContext;
  postId: number;
  payload: WordPressPostPayload;
}): Promise<WordPressPostResult> {
  if (!isFeatureEnabled("wordpress", input.context)) {
    return {
      status: "feature_disabled",
      message: featureDisabledMessage("wordpress"),
    };
  }

  if (!Number.isFinite(input.postId) || input.postId <= 0) {
    return {
      status: "validation_failed",
      message: "有効な記事IDを指定してください",
    };
  }

  const title = input.payload.title?.trim() ?? "";
  const content = input.payload.content?.trim() ?? "";
  if (!title || !content) {
    return {
      status: "validation_failed",
      message: "タイトルと本文を入力してください",
    };
  }

  await ensureExternalAuthHydrated(input.userId);
  const ctx = requireAuth(input.userId);
  if (!ctx) {
    return { status: "wp_not_connected", message: WP_NOT_CONNECTED_MESSAGE };
  }

  try {
    const featuredMediaId = await resolveFeaturedMediaId(
      input.userId,
      input.payload,
    );
    const body = buildPostBody(
      {
        ...input.payload,
        title,
        content,
        status: input.payload.status ?? "draft",
      },
      featuredMediaId,
    );
    const idempotencyKey = buildIdempotencyKey({
      integration: "wordpress",
      action: "update",
      userId: input.userId,
      fingerprint: `${input.postId}|${JSON.stringify(body)}`,
    });
    const executed = await runIntegrationAction(
      {
        integration: "wordpress",
        action: "update",
        userId: input.userId,
        idempotencyKey,
        preventDuplicate: true,
        maxAttempts: 3,
      },
      () => updateWordPressPost(ctx.auth, input.postId, body),
    );
    const updated = executed.value;
    await touchWordPressConnectionLastUsed(input.userId);

    return {
      status: "updated",
      message: "WordPressの記事を更新しました",
      postId: updated.id,
      link: updated.link ?? null,
      postStatus: updated.status,
    };
  } catch (error) {
    if (error instanceof WordPressApiError && error.isAuthFailure) {
      await markWordPressAuthFailure(input.userId);
    }
    return mapAuthError(error);
  }
}

export async function fetchWordPressCategoriesForUser(input: {
  userId: string;
  context: FeatureAccessContext;
}): Promise<
  | { status: "ok"; categories: WordPressCategory[] }
  | { status: "error" | "wp_not_connected" | "feature_disabled" | "auth_failure"; message: string }
> {
  if (!isFeatureEnabled("wordpress", input.context)) {
    return {
      status: "feature_disabled",
      message: featureDisabledMessage("wordpress"),
    };
  }

  await ensureExternalAuthHydrated(input.userId);
  const ctx = requireAuth(input.userId);
  if (!ctx) {
    return { status: "wp_not_connected", message: WP_NOT_CONNECTED_MESSAGE };
  }

  try {
    const categories = await listWordPressCategories(ctx.auth);
    await touchWordPressConnectionLastUsed(input.userId);
    return { status: "ok", categories };
  } catch (error) {
    if (error instanceof WordPressApiError && error.isAuthFailure) {
      await markWordPressAuthFailure(input.userId);
      return { status: "auth_failure", message: WP_AUTH_FAILURE_MESSAGE };
    }
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "カテゴリの取得に失敗しました",
    };
  }
}

export async function fetchWordPressTagsForUser(input: {
  userId: string;
  context: FeatureAccessContext;
}): Promise<
  | { status: "ok"; tags: WordPressTag[] }
  | { status: "error" | "wp_not_connected" | "feature_disabled" | "auth_failure"; message: string }
> {
  if (!isFeatureEnabled("wordpress", input.context)) {
    return {
      status: "feature_disabled",
      message: featureDisabledMessage("wordpress"),
    };
  }

  await ensureExternalAuthHydrated(input.userId);
  const ctx = requireAuth(input.userId);
  if (!ctx) {
    return { status: "wp_not_connected", message: WP_NOT_CONNECTED_MESSAGE };
  }

  try {
    const tags = await listWordPressTags(ctx.auth);
    await touchWordPressConnectionLastUsed(input.userId);
    return { status: "ok", tags };
  } catch (error) {
    if (error instanceof WordPressApiError && error.isAuthFailure) {
      await markWordPressAuthFailure(input.userId);
      return { status: "auth_failure", message: WP_AUTH_FAILURE_MESSAGE };
    }
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "タグの取得に失敗しました",
    };
  }
}
