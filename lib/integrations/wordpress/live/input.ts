/**
 * Runtime validation for WordPress Automation step input.
 */

import { createHash } from "node:crypto";

import { normalizeWordPressSiteUrl } from "@/lib/integrations/wordpress/config";

import {
  WORDPRESS_ACTIONS,
  type WordPressLiveAction,
  type WordPressStepInput,
} from "./types";

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    if (typeof value === "string" && value.trim()) {
      return value
        .split(/[,;]/)
        .map((item) => Number.parseInt(item.trim(), 10))
        .filter((n) => Number.isFinite(n) && n > 0);
    }
    return [];
  }
  return value
    .map((item) =>
      typeof item === "number"
        ? item
        : typeof item === "string"
          ? Number.parseInt(item.trim(), 10)
          : NaN,
    )
    .filter((n) => Number.isFinite(n) && n > 0);
}

function resolveAction(
  configuration: Readonly<Record<string, unknown>>,
): WordPressLiveAction {
  const publishMode = asString(configuration.publishMode)?.toLowerCase();
  if (publishMode === "publish") return "publish";
  if (publishMode === "draft") return "draft";

  const raw =
    asString(configuration.action) ??
    asString(configuration.mode) ??
    asString(configuration.operation) ??
    "draft";
  const normalized = raw.toLowerCase().replace(/\s+/g, "_");
  if (normalized === "create_draft" || normalized === "save_draft") {
    return "draft";
  }
  if (normalized === "publish_post" || normalized === "post") {
    return "publish";
  }
  if ((WORDPRESS_ACTIONS as readonly string[]).includes(normalized)) {
    return normalized as WordPressLiveAction;
  }
  throw new Error(`wordpress invalid action: ${raw}`);
}

export function hashWordPressTitle(title: string): string {
  return createHash("sha256").update(title).digest("hex");
}

export function hashWordPressContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function hashWordPressMediaArtifacts(ids: string[]): string {
  return createHash("sha256")
    .update([...ids].sort().join("|"))
    .digest("hex");
}

export function buildWordPressEditLink(siteUrl: string, postId: number): string {
  const base = normalizeWordPressSiteUrl(siteUrl);
  return `${base}/wp-admin/post.php?post=${postId}&action=edit`;
}

export function buildWordPressIdempotencyKey(input: {
  ownerId: string;
  runId: string;
  stepId: string;
  action: WordPressLiveAction;
  titleHash: string;
  contentHash: string;
  mediaHash: string;
  postId?: number | null;
  occurrenceKey?: string | null;
  explicitKey?: string | null;
}): string {
  if (input.explicitKey?.trim()) {
    return `${input.action}:${input.explicitKey.trim()}`;
  }
  return createHash("sha256")
    .update(
      [
        input.ownerId,
        input.runId,
        input.stepId,
        input.action,
        String(input.postId ?? ""),
        input.titleHash,
        input.contentHash,
        input.mediaHash,
        input.occurrenceKey ?? "",
      ].join("|"),
    )
    .digest("hex");
}

export function resolveWordPressStepInput(input: {
  ownerId: string;
  organizationId?: string | null;
  runId: string;
  stepId: string;
  diagnosticId?: string | null;
  configuration: Readonly<Record<string, unknown>>;
  inputBindings: Readonly<Record<string, unknown>>;
  siteUrl: string;
  occurrenceKey?: string | null;
}): WordPressStepInput {
  const action = resolveAction(input.configuration);

  const title =
    asString(input.configuration.title) ??
    asString(input.inputBindings.title) ??
  "";
  const content =
    asString(input.configuration.content) ??
    asString(input.inputBindings.content) ??
    asString(input.configuration.body) ??
    asString(input.inputBindings.body) ??
    "";

  if (!title || !content) {
    throw new Error("wordpress validation failed: title and content required");
  }

  const postIdRaw =
    input.configuration.postId ??
    input.inputBindings.postId ??
    input.configuration.wordpressPostId;
  let postId: number | null = null;
  if (typeof postIdRaw === "number" && Number.isFinite(postIdRaw) && postIdRaw > 0) {
    postId = postIdRaw;
  } else if (typeof postIdRaw === "string" && postIdRaw.trim()) {
    const parsed = Number.parseInt(postIdRaw.trim(), 10);
    if (Number.isFinite(parsed) && parsed > 0) postId = parsed;
  }

  if (action === "update" && !postId) {
    throw new Error("wordpress validation failed: postId required for update");
  }

  const featuredMediaArtifactId =
    asString(input.configuration.featuredImageArtifactId) ??
    asString(input.configuration.featuredMediaArtifactId) ??
    asString(input.configuration.artifactId) ??
    asString(input.inputBindings.artifactId) ??
    null;

  const titleHash = hashWordPressTitle(title);
  const contentHash = hashWordPressContent(content);
  const mediaIds = featuredMediaArtifactId ? [featuredMediaArtifactId] : [];
  const mediaHash = hashWordPressMediaArtifacts(mediaIds);

  const approvalRequired =
    action === "publish" ||
    input.configuration.approvalRequired === true ||
    input.configuration.approvalRequired === "true";

  const idempotencyKey = buildWordPressIdempotencyKey({
    ownerId: input.ownerId,
    runId: input.runId,
    stepId: input.stepId,
    action,
    titleHash,
    contentHash,
    mediaHash,
    postId,
    occurrenceKey: input.occurrenceKey,
    explicitKey: asString(input.configuration.idempotencyKey),
  });

  return {
    action,
    title,
    content,
    excerpt:
      asString(input.configuration.excerpt) ??
      asString(input.inputBindings.excerpt) ??
      null,
    categories: asNumberArray(
      input.configuration.categories ?? input.inputBindings.categories,
    ),
    tags: asNumberArray(input.configuration.tags ?? input.inputBindings.tags),
    postId,
    featuredMediaArtifactId,
    featuredImageAlt:
      asString(input.configuration.featuredImageAlt) ??
      asString(input.inputBindings.featuredImageAlt) ??
      null,
    approvalRequired,
    idempotencyKey,
    ownerId: input.ownerId,
    organizationId: input.organizationId ?? null,
    runId: input.runId,
    stepId: input.stepId,
    diagnosticId:
      input.diagnosticId?.trim() || input.runId || `wp_${input.stepId}`,
    siteUrl: input.siteUrl,
  };
}
