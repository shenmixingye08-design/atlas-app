import "server-only";

import { isFeatureEnabled } from "@/lib/feature-flags/access";
import type { FeatureAccessContext } from "@/lib/feature-flags/types";
import { featureDisabledMessage } from "@/lib/feature-flags/guards";

import {
  WordPressApiError,
  createWordPressPost,
  listWordPressCategories,
  listWordPressTags,
  updateWordPressPost,
  uploadWordPressMediaFromUrl,
} from "../api-client";
import {
  markWordPressAuthFailure,
  resolveWordPressAuthContext,
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

type WordPressAuthGate =
  | {
      status: "ready";
      auth: {
        siteUrl: string;
        username: string;
        applicationPassword: string;
      };
    }
  | { status: "not_connected" }
  | {
      status: "unavailable";
      developerCode: "durable_read_failed";
      message: string;
    }
  | {
      status: "configuration_error";
      developerCode: "missing_encryption_key";
      message: string;
    };

function authGateFailure(
  ctx: Exclude<WordPressAuthGate, { status: "ready" }>,
): WordPressPostResult {
  if (ctx.status === "configuration_error") {
    return {
      status: "configuration_error",
      message: ctx.message,
      developerCode: ctx.developerCode,
      httpStatus: 503,
    };
  }
  if (ctx.status === "unavailable") {
    return {
      status: "durable_unavailable",
      message: ctx.message,
      developerCode: ctx.developerCode,
      httpStatus: 503,
    };
  }
  return { status: "wp_not_connected", message: WP_NOT_CONNECTED_MESSAGE };
}

async function requireAuth(userId: string): Promise<WordPressAuthGate> {
  const resolved = await resolveWordPressAuthContext(userId);
  if (resolved.status === "unavailable" || resolved.status === "configuration_error") {
    return resolved;
  }
  if (resolved.status !== "ready") {
    return { status: "not_connected" };
  }
  return { status: "ready", auth: resolved.auth };
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
  if (payload.slug?.trim()) body.slug = payload.slug.trim();
  if (payload.categories?.length) body.categories = payload.categories;
  if (payload.tags?.length) body.tags = payload.tags;
  const mediaId = featuredMediaId ?? payload.featuredMediaId;
  if (typeof mediaId === "number" && mediaId > 0) {
    body.featured_media = mediaId;
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

  const ctx = await requireAuth(userId);
  if (ctx.status !== "ready") return undefined;

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
  automationId?: string | null;
  runId?: string | null;
  occurrenceKey?: string | null;
  discriminator?: string | null;
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

  const ctx = await requireAuth(input.userId);
  if (ctx.status !== "ready") {
    return authGateFailure(ctx);
  }

  const publishStatus = input.payload.status ?? "draft";
  if (publishStatus === "publish") {
    const { evaluateBillingWordPressPublish } = await import(
      "@/lib/billing/access"
    );
    const billing = await evaluateBillingWordPressPublish(input.userId);
    if (billing.denial) {
      return {
        status: "plan_limited",
        message: billing.denial.reason,
        httpStatus: billing.denial.status,
      };
    }
  }

  try {
    const featuredMediaId = await resolveFeaturedMediaId(
      input.userId,
      input.payload,
    );
    const status = publishStatus;
    const { createHash } = await import("node:crypto");
    const { executeIdempotentSideEffect } = await import(
      "@/lib/side-effects/execute"
    );
    const contentHash = createHash("sha256")
      .update(`${title}\n${content}\n${status}`)
      .digest("hex")
      .slice(0, 24);
    const sideEffect = await executeIdempotentSideEffect(
      {
        userId: input.userId,
        provider: "wordpress",
        actionType: status === "publish" ? "publish" : "post",
        destination: ctx.auth.siteUrl ?? "wordpress",
        automationId: input.automationId ?? null,
        runId: input.runId ?? null,
        occurrenceKey: input.occurrenceKey ?? input.runId ?? null,
        discriminator: input.discriminator ?? contentHash,
      },
      async () => {
        const created = await createWordPressPost(
          ctx.auth,
          buildPostBody(
            { ...input.payload, title, content, status },
            featuredMediaId,
          ),
        );
        return {
          providerResourceId: String(created.id),
          result: { created },
          evidence: { provider: "wordpress", status, contentHash },
        };
      },
    );
    const created = sideEffect.result.created;
    await touchWordPressConnectionLastUsed(input.userId);

    if (status === "publish" && created.id != null) {
      const { recordWordPressPublishUsageOnce } = await import(
        "@/lib/billing/usage/external-counters"
      );
      recordWordPressPublishUsageOnce({
        userId: input.userId,
        postId: created.id,
      });
    }

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

  const ctx = await requireAuth(input.userId);
  if (ctx.status !== "ready") {
    return authGateFailure(ctx);
  }

  const updateStatus = input.payload.status ?? "draft";
  if (updateStatus === "publish") {
    const { evaluateBillingWordPressPublish } = await import(
      "@/lib/billing/access"
    );
    const billing = await evaluateBillingWordPressPublish(input.userId);
    if (billing.denial) {
      return {
        status: "plan_limited",
        message: billing.denial.reason,
        httpStatus: billing.denial.status,
      };
    }
  }

  try {
    const featuredMediaId = await resolveFeaturedMediaId(
      input.userId,
      input.payload,
    );
    const updated = await updateWordPressPost(
      ctx.auth,
      input.postId,
      buildPostBody(
        {
          ...input.payload,
          title,
          content,
          status: updateStatus,
        },
        featuredMediaId,
      ),
    );
    await touchWordPressConnectionLastUsed(input.userId);

    if (updateStatus === "publish" && updated.id != null) {
      const { recordWordPressPublishUsageOnce } = await import(
        "@/lib/billing/usage/external-counters"
      );
      recordWordPressPublishUsageOnce({
        userId: input.userId,
        postId: updated.id,
      });
    }

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

type WordPressTaxonomyFailure = {
  status:
    | "error"
    | "wp_not_connected"
    | "durable_unavailable"
    | "configuration_error"
    | "feature_disabled"
    | "auth_failure";
  message: string;
  developerCode?: string;
};

function taxonomyAuthFailure(
  ctx: Exclude<WordPressAuthGate, { status: "ready" }>,
): WordPressTaxonomyFailure {
  if (ctx.status === "configuration_error") {
    return {
      status: "configuration_error",
      message: ctx.message,
      developerCode: ctx.developerCode,
    };
  }
  if (ctx.status === "unavailable") {
    return {
      status: "durable_unavailable",
      message: ctx.message,
      developerCode: ctx.developerCode,
    };
  }
  return { status: "wp_not_connected", message: WP_NOT_CONNECTED_MESSAGE };
}

export async function fetchWordPressCategoriesForUser(input: {
  userId: string;
  context: FeatureAccessContext;
}): Promise<
  | { status: "ok"; categories: WordPressCategory[] }
  | WordPressTaxonomyFailure
> {
  if (!isFeatureEnabled("wordpress", input.context)) {
    return {
      status: "feature_disabled",
      message: featureDisabledMessage("wordpress"),
    };
  }

  const ctx = await requireAuth(input.userId);
  if (ctx.status !== "ready") {
    return taxonomyAuthFailure(ctx);
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
}): Promise<{ status: "ok"; tags: WordPressTag[] } | WordPressTaxonomyFailure> {
  if (!isFeatureEnabled("wordpress", input.context)) {
    return {
      status: "feature_disabled",
      message: featureDisabledMessage("wordpress"),
    };
  }

  const ctx = await requireAuth(input.userId);
  if (ctx.status !== "ready") {
    return taxonomyAuthFailure(ctx);
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

export async function uploadWordPressMediaForUser(input: {
  userId: string;
  context: FeatureAccessContext;
  imageUrl: string;
  altText?: string;
  filename?: string;
}): Promise<
  | { status: "ok"; media: { id: number; sourceUrl: string; altText: string } }
  | WordPressTaxonomyFailure
> {
  if (!isFeatureEnabled("wordpress", input.context)) {
    return {
      status: "feature_disabled",
      message: featureDisabledMessage("wordpress"),
    };
  }

  const ctx = await requireAuth(input.userId);
  if (ctx.status !== "ready") {
    return taxonomyAuthFailure(ctx);
  }

  try {
    const media = await uploadWordPressMediaFromUrl({
      auth: ctx.auth,
      imageUrl: input.imageUrl,
      altText: input.altText,
      filename: input.filename,
    });
    await touchWordPressConnectionLastUsed(input.userId);
    return {
      status: "ok",
      media: {
        id: media.id,
        sourceUrl: media.sourceUrl,
        altText: media.altText,
      },
    };
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
          : "メディアのアップロードに失敗しました",
    };
  }
}
