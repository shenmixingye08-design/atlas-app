import type {
  WordPressCategory,
  WordPressConnectInput,
  WordPressConnectionCheckResult,
  WordPressPostPayload,
  WordPressPostResult,
  WordPressTag,
} from "./types";

export type {
  WordPressCategory,
  WordPressConnectInput,
  WordPressConnectionCheckResult,
  WordPressPostPayload,
  WordPressPostResult,
  WordPressTag,
};

async function parseJson<T>(response: Response): Promise<T | null> {
  return (await response.json().catch(() => null)) as T | null;
}

export async function fetchWordPressConnectionStatusClient(): Promise<WordPressConnectionCheckResult> {
  const response = await fetch("/api/wordpress/connection", { cache: "no-store" });
  const body = await parseJson<WordPressConnectionCheckResult>(response);
  if (!body) {
    return {
      status: "error",
      connected: false,
      message: "WordPress接続状態を取得できませんでした",
    };
  }
  return body;
}

export async function connectWordPressClient(
  input: WordPressConnectInput,
): Promise<{ connection: unknown; message: string }> {
  const response = await fetch("/api/wordpress/connection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await parseJson<{
    connection?: unknown;
    message?: string;
    error?: string;
  }>(response);

  if (!response.ok) {
    throw new Error(body?.error ?? body?.message ?? "WordPress接続に失敗しました");
  }

  return {
    connection: body?.connection,
    message: body?.message ?? "WordPressを接続しました",
  };
}

export async function disconnectWordPressClient(): Promise<void> {
  const response = await fetch("/api/wordpress/connection", {
    method: "DELETE",
  });
  if (!response.ok) {
    const body = await parseJson<{ error?: string }>(response);
    throw new Error(body?.error ?? "WordPress連携の解除に失敗しました");
  }
}

export async function verifyWordPressConnectionClient(): Promise<WordPressConnectionCheckResult> {
  const response = await fetch("/api/wordpress/connection/verify", {
    method: "POST",
  });
  const body = await parseJson<WordPressConnectionCheckResult>(response);
  if (!body) {
    return {
      status: "error",
      connected: false,
      message: "接続確認に失敗しました",
    };
  }
  return body;
}

export async function createWordPressPostClient(
  payload: WordPressPostPayload,
): Promise<WordPressPostResult> {
  const response = await fetch("/api/wordpress/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await parseJson<WordPressPostResult>(response);
  if (!body) {
    return { status: "error", message: "WordPressへの投稿に失敗しました" };
  }
  return body;
}

export async function updateWordPressPostClient(
  postId: number,
  payload: WordPressPostPayload,
): Promise<WordPressPostResult> {
  const response = await fetch(`/api/wordpress/posts/${postId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await parseJson<WordPressPostResult>(response);
  if (!body) {
    return { status: "error", message: "WordPress記事の更新に失敗しました" };
  }
  return body;
}

export async function fetchWordPressCategoriesClient(): Promise<
  | { status: "ok"; categories: WordPressCategory[] }
  | {
      status: "error" | "wp_not_connected" | "feature_disabled" | "auth_failure";
      message: string;
    }
> {
  const response = await fetch("/api/wordpress/categories", { cache: "no-store" });
  const body = await parseJson<{
    status?: string;
    categories?: WordPressCategory[];
    message?: string;
  }>(response);
  if (body?.status === "ok" && Array.isArray(body.categories)) {
    return { status: "ok", categories: body.categories };
  }
  return {
    status:
      body?.status === "wp_not_connected" ||
      body?.status === "feature_disabled" ||
      body?.status === "auth_failure"
        ? body.status
        : "error",
    message: body?.message ?? "カテゴリの取得に失敗しました",
  };
}

export async function fetchWordPressTagsClient(): Promise<
  | { status: "ok"; tags: WordPressTag[] }
  | {
      status: "error" | "wp_not_connected" | "feature_disabled" | "auth_failure";
      message: string;
    }
> {
  const response = await fetch("/api/wordpress/tags", { cache: "no-store" });
  const body = await parseJson<{
    status?: string;
    tags?: WordPressTag[];
    message?: string;
  }>(response);
  if (body?.status === "ok" && Array.isArray(body.tags)) {
    return { status: "ok", tags: body.tags };
  }
  return {
    status:
      body?.status === "wp_not_connected" ||
      body?.status === "feature_disabled" ||
      body?.status === "auth_failure"
        ? body.status
        : "error",
    message: body?.message ?? "タグの取得に失敗しました",
  };
}
