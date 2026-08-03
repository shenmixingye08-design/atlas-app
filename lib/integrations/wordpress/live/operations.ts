/**
 * WordPress REST operations with re-fetch verification.
 */

import "server-only";

import type { WordPressAuthContext } from "@/lib/integrations/wordpress/api-client";
import {
  createWordPressPost,
  getWordPressMedia,
  getWordPressPost,
  updateWordPressPost,
  uploadWordPressMedia,
  WordPressApiError,
} from "@/lib/integrations/wordpress/api-client";

import {
  hashWordPressContent,
  hashWordPressTitle,
} from "./input";
import type { LoadedWordPressMedia } from "./media";

export type VerifiedWordPressPost = {
  postId: number;
  status: string;
  link: string;
  titleHash: string;
  contentHash: string;
};

export async function uploadWordPressMediaVerified(input: {
  auth: WordPressAuthContext;
  media: LoadedWordPressMedia;
}): Promise<{ mediaId: number; sourceUrl: string }> {
  const uploaded = await uploadWordPressMedia({
    auth: input.auth,
    bytes: input.media.buffer,
    filename: input.media.fileName,
    mimeType: input.media.mimeType,
    altText: input.media.altText ?? undefined,
  });

  const verified = await getWordPressMedia(input.auth, uploaded.id);
  if (verified.id !== uploaded.id) {
    throw new Error("verification failed: media id mismatch on re-fetch");
  }
  if (!verified.source_url?.trim()) {
    throw new Error("verification failed: media source_url missing on re-fetch");
  }

  return {
    mediaId: verified.id,
    sourceUrl: verified.source_url,
  };
}

function buildPostBody(input: {
  title: string;
  content: string;
  status: "draft" | "publish";
  excerpt?: string | null;
  categories?: number[];
  tags?: number[];
  featuredMediaId?: number | null;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    title: input.title,
    content: input.content,
    status: input.status,
  };
  if (input.excerpt) body.excerpt = input.excerpt;
  if (input.categories?.length) body.categories = input.categories;
  if (input.tags?.length) body.tags = input.tags;
  if (typeof input.featuredMediaId === "number" && input.featuredMediaId > 0) {
    body.featured_media = input.featuredMediaId;
  }
  return body;
}

async function verifyPost(input: {
  auth: WordPressAuthContext;
  postId: number;
  expectedTitle: string;
  expectedContent: string;
  expectedStatus?: string;
}): Promise<VerifiedWordPressPost> {
  const post = await getWordPressPost(input.auth, input.postId);
  if (post.id !== input.postId) {
    throw new Error("verification failed: post id mismatch on re-fetch");
  }
  if (!post.link?.trim()) {
    throw new Error("verification failed: post link missing on re-fetch");
  }
  if (input.expectedStatus && post.status !== input.expectedStatus) {
    throw new Error(
      `verification failed: post status mismatch (expected ${input.expectedStatus}, got ${post.status})`,
    );
  }

  const titleRendered = post.title?.rendered?.trim() ?? "";
  const contentRendered = post.content?.rendered?.trim() ?? "";
  const titleHash = hashWordPressTitle(input.expectedTitle);
  const contentHash = hashWordPressContent(input.expectedContent);

  // WordPress may wrap HTML; compare hashes of expected input only when plain match fails.
  if (
    titleRendered &&
    titleRendered !== input.expectedTitle &&
    hashWordPressTitle(titleRendered) !== titleHash
  ) {
    throw new Error("verification failed: title mismatch on re-fetch");
  }
  if (
    contentRendered &&
    contentRendered !== input.expectedContent &&
    hashWordPressContent(contentRendered) !== contentHash
  ) {
    throw new Error("verification failed: content mismatch on re-fetch");
  }

  return {
    postId: post.id,
    status: post.status,
    link: post.link,
    titleHash,
    contentHash,
  };
}

export async function createAndVerifyWordPressPost(input: {
  auth: WordPressAuthContext;
  title: string;
  content: string;
  status: "draft" | "publish";
  excerpt?: string | null;
  categories?: number[];
  tags?: number[];
  featuredMediaId?: number | null;
}): Promise<VerifiedWordPressPost> {
  const created = await createWordPressPost(
    input.auth,
    buildPostBody(input),
  );
  if (!created.id) {
    throw new WordPressApiError("記事IDを取得できませんでした", 0);
  }
  return verifyPost({
    auth: input.auth,
    postId: created.id,
    expectedTitle: input.title,
    expectedContent: input.content,
    expectedStatus: input.status,
  });
}

export async function updateAndVerifyWordPressPost(input: {
  auth: WordPressAuthContext;
  postId: number;
  title: string;
  content: string;
  status?: "draft" | "publish";
  excerpt?: string | null;
  categories?: number[];
  tags?: number[];
  featuredMediaId?: number | null;
}): Promise<VerifiedWordPressPost> {
  const body = buildPostBody({
    title: input.title,
    content: input.content,
    status: input.status ?? "draft",
    excerpt: input.excerpt,
    categories: input.categories,
    tags: input.tags,
    featuredMediaId: input.featuredMediaId,
  });
  const updated = await updateWordPressPost(input.auth, input.postId, body);
  if (!updated.id) {
    throw new WordPressApiError("記事IDを取得できませんでした", 0);
  }
  return verifyPost({
    auth: input.auth,
    postId: updated.id,
    expectedTitle: input.title,
    expectedContent: input.content,
    expectedStatus: input.status,
  });
}

export async function publishAndVerifyWordPressPost(input: {
  auth: WordPressAuthContext;
  postId: number;
  title: string;
  content: string;
}): Promise<VerifiedWordPressPost> {
  return updateAndVerifyWordPressPost({
    auth: input.auth,
    postId: input.postId,
    title: input.title,
    content: input.content,
    status: "publish",
  });
}

export async function getWordPressPostVerified(input: {
  auth: WordPressAuthContext;
  postId: number;
}): Promise<VerifiedWordPressPost> {
  const post = await getWordPressPost(input.auth, input.postId);
  if (!post.id || !post.link?.trim()) {
    throw new Error("verification failed: post not re-fetchable");
  }
  const titleRendered = post.title?.rendered?.trim() ?? "";
  const contentRendered = post.content?.rendered?.trim() ?? "";
  return {
    postId: post.id,
    status: post.status,
    link: post.link,
    titleHash: hashWordPressTitle(titleRendered),
    contentHash: hashWordPressContent(contentRendered),
  };
}
