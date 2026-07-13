import "server-only";

import {
  buildWordPressRestBase,
  normalizeApplicationPassword,
  normalizeWordPressSiteUrl,
} from "./config";
import {
  WP_AUTH_FAILURE_MESSAGE,
  WP_CONNECTION_ERROR_MESSAGE,
} from "./errors";
import type {
  WordPressCategory,
  WordPressMediaUploadResult,
  WordPressTag,
} from "./types";

export class WordPressApiError extends Error {
  readonly statusCode: number;
  readonly isAuthFailure: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "WordPressApiError";
    this.statusCode = statusCode;
    this.isAuthFailure = statusCode === 401 || statusCode === 403;
  }
}

export type WordPressAuthContext = {
  siteUrl: string;
  username: string;
  applicationPassword: string;
};

export type WordPressUserMe = {
  id: number;
  name: string;
  slug: string;
  url?: string;
};

export type WordPressPostResponse = {
  id: number;
  link: string;
  status: string;
  title?: { rendered?: string };
};

function basicAuthHeader(username: string, applicationPassword: string): string {
  const token = Buffer.from(
    `${username}:${normalizeApplicationPassword(applicationPassword)}`,
    "utf8",
  ).toString("base64");
  return `Basic ${token}`;
}

function restBase(siteUrl: string): string {
  return buildWordPressRestBase(siteUrl);
}

async function parseJsonSafe(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function extractWpErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const record = payload as {
    message?: string;
    code?: string;
  };
  if (typeof record.message === "string" && record.message.trim()) {
    // Never echo raw credential-related payloads beyond WP message.
    return record.message;
  }
  return fallback;
}

async function wpFetch(
  auth: WordPressAuthContext,
  path: string,
  init?: RequestInit & { rawBody?: BodyInit | null },
): Promise<Response> {
  const siteUrl = normalizeWordPressSiteUrl(auth.siteUrl);
  const url = `${restBase(siteUrl)}${path}`;

  const headers = new Headers(init?.headers);
  headers.set(
    "Authorization",
    basicAuthHeader(auth.username, auth.applicationPassword),
  );
  if (init?.rawBody === undefined && init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(url, {
    ...init,
    headers,
    body: init?.rawBody !== undefined ? init.rawBody : init?.body,
    cache: "no-store",
  });
}

async function assertOk(
  response: Response,
  fallback: string,
): Promise<unknown> {
  const payload = await parseJsonSafe(response);
  if (response.ok) return payload;

  if (response.status === 401 || response.status === 403) {
    throw new WordPressApiError(WP_AUTH_FAILURE_MESSAGE, response.status);
  }

  throw new WordPressApiError(
    extractWpErrorMessage(payload, fallback),
    response.status,
  );
}

/** Verify credentials via /users/me. */
export async function fetchWordPressCurrentUser(
  auth: WordPressAuthContext,
): Promise<WordPressUserMe> {
  let response: Response;
  try {
    response = await wpFetch(auth, "/users/me?context=edit");
  } catch {
    throw new WordPressApiError(WP_CONNECTION_ERROR_MESSAGE, 0);
  }

  const payload = (await assertOk(
    response,
    WP_CONNECTION_ERROR_MESSAGE,
  )) as WordPressUserMe;

  if (!payload?.id) {
    throw new WordPressApiError(WP_CONNECTION_ERROR_MESSAGE, response.status);
  }

  return payload;
}

export async function createWordPressPost(
  auth: WordPressAuthContext,
  body: Record<string, unknown>,
): Promise<WordPressPostResponse> {
  const response = await wpFetch(auth, "/posts", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const payload = (await assertOk(
    response,
    "記事の作成に失敗しました",
  )) as WordPressPostResponse;
  if (!payload?.id) {
    throw new WordPressApiError("記事IDを取得できませんでした", response.status);
  }
  return payload;
}

export async function updateWordPressPost(
  auth: WordPressAuthContext,
  postId: number,
  body: Record<string, unknown>,
): Promise<WordPressPostResponse> {
  const response = await wpFetch(auth, `/posts/${postId}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const payload = (await assertOk(
    response,
    "記事の更新に失敗しました",
  )) as WordPressPostResponse;
  if (!payload?.id) {
    throw new WordPressApiError("記事IDを取得できませんでした", response.status);
  }
  return payload;
}

export async function listWordPressCategories(
  auth: WordPressAuthContext,
): Promise<WordPressCategory[]> {
  const response = await wpFetch(
    auth,
    "/categories?per_page=100&orderby=name&order=asc",
  );
  const payload = (await assertOk(
    response,
    "カテゴリの取得に失敗しました",
  )) as WordPressCategory[];
  if (!Array.isArray(payload)) return [];
  return payload.map((item) => ({
    id: item.id,
    name: item.name,
    slug: item.slug,
    parent: item.parent ?? 0,
    count: item.count ?? 0,
  }));
}

export async function listWordPressTags(
  auth: WordPressAuthContext,
): Promise<WordPressTag[]> {
  const response = await wpFetch(
    auth,
    "/tags?per_page=100&orderby=name&order=asc",
  );
  const payload = (await assertOk(
    response,
    "タグの取得に失敗しました",
  )) as WordPressTag[];
  if (!Array.isArray(payload)) return [];
  return payload.map((item) => ({
    id: item.id,
    name: item.name,
    slug: item.slug,
    count: item.count ?? 0,
  }));
}

export async function uploadWordPressMedia(input: {
  auth: WordPressAuthContext;
  bytes: ArrayBuffer | Buffer;
  filename: string;
  mimeType: string;
  altText?: string;
}): Promise<WordPressMediaUploadResult> {
  const buffer = Buffer.isBuffer(input.bytes)
    ? input.bytes
    : Buffer.from(input.bytes);

  const response = await wpFetch(input.auth, "/media", {
    method: "POST",
    headers: {
      "Content-Disposition": `attachment; filename="${input.filename.replace(/"/g, "")}"`,
      "Content-Type": input.mimeType,
    },
    rawBody: new Uint8Array(buffer),
    body: undefined,
  });

  const payload = (await assertOk(
    response,
    "メディアのアップロードに失敗しました",
  )) as {
    id?: number;
    source_url?: string;
    alt_text?: string;
  };

  if (!payload?.id) {
    throw new WordPressApiError(
      "メディアIDを取得できませんでした",
      response.status,
    );
  }

  if (input.altText) {
    try {
      await wpFetch(input.auth, `/media/${payload.id}`, {
        method: "POST",
        body: JSON.stringify({ alt_text: input.altText }),
      });
    } catch {
      // Alt text is best-effort; media itself succeeded.
    }
  }

  return {
    id: payload.id,
    sourceUrl: payload.source_url ?? "",
    altText: input.altText ?? payload.alt_text ?? "",
  };
}

export async function uploadWordPressMediaFromUrl(input: {
  auth: WordPressAuthContext;
  imageUrl: string;
  altText?: string;
  filename?: string;
}): Promise<WordPressMediaUploadResult> {
  let imageResponse: Response;
  try {
    imageResponse = await fetch(input.imageUrl, { cache: "no-store" });
  } catch {
    throw new WordPressApiError("アイキャッチ画像の取得に失敗しました", 0);
  }

  if (!imageResponse.ok) {
    throw new WordPressApiError(
      "アイキャッチ画像の取得に失敗しました",
      imageResponse.status,
    );
  }

  const mimeType =
    imageResponse.headers.get("content-type")?.split(";")[0]?.trim() ||
    "image/jpeg";
  const extension =
    mimeType === "image/png"
      ? "png"
      : mimeType === "image/webp"
        ? "webp"
        : mimeType === "image/gif"
          ? "gif"
          : "jpg";
  const filename =
    input.filename?.trim() ||
    `atlas-featured-${Date.now()}.${extension}`;

  const bytes = await imageResponse.arrayBuffer();
  return uploadWordPressMedia({
    auth: input.auth,
    bytes,
    filename,
    mimeType,
    altText: input.altText,
  });
}
