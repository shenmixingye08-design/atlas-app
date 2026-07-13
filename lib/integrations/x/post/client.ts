import type { XConnectionCheckResult } from "@/lib/integrations/x/connection-types";
import type {
  XDraftPost,
  XDraftPostsResult,
  XPostHistoryRecord,
  XPostHistoryResult,
  XPostLookupResult,
  XPostMode,
  XPostResult,
  XPostValidationSummary,
  XScheduledPost,
  XScheduledPostsResult,
} from "./types";

export type {
  XDraftPost,
  XDraftPostsResult,
  XPostHistoryRecord,
  XPostHistoryResult,
  XPostLookupResult,
  XPostMode,
  XPostResult,
  XPostValidationSummary,
  XScheduledPost,
  XScheduledPostsResult,
};

export type { XConnectionCheckResult };

async function parseXPostErrorResponse(
  response: Response,
): Promise<XPostResult | null> {
  const body = (await response.json().catch(() => null)) as {
    message?: string;
    status?: string;
    validation?: XPostValidationSummary;
  } | null;

  if (body?.status === "x_not_connected") {
    return {
      status: "x_not_connected",
      message: body.message ?? "Xを接続してください",
    };
  }

  if (body?.status === "feature_disabled") {
    return {
      status: "feature_disabled",
      message: body.message ?? "X連携は現在ご利用いただけません",
    };
  }

  if (body?.status === "validation_failed" && body.validation) {
    return {
      status: "validation_failed",
      message: body.message ?? "投稿内容の検証に失敗しました",
      validation: body.validation,
    };
  }

  if (body?.status === "error") {
    return {
      status: "error",
      message: body.message ?? "Xへの投稿に失敗しました",
    };
  }

  return null;
}

export async function createXPostClient(input: {
  text: string;
  mode: XPostMode;
  scheduledFor?: string | null;
  automationId?: string | null;
  draftId?: string | null;
}): Promise<XPostResult> {
  const response = await fetch("/api/x/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const known = await parseXPostErrorResponse(response);
    if (known) return known;
    throw new Error("Xへの投稿に失敗しました");
  }

  return response.json() as Promise<XPostResult>;
}

export async function fetchXConnectionStatusClient(): Promise<XConnectionCheckResult> {
  const response = await fetch("/api/x/connection", { cache: "no-store" });
  const body = (await response.json().catch(() => null)) as
    | XConnectionCheckResult
    | { message?: string }
    | null;

  if (!response.ok) {
    if (body && "status" in body) {
      return body as XConnectionCheckResult;
    }
    throw new Error(
      (body && "message" in body && body.message) ||
        "X接続状態の取得に失敗しました",
    );
  }

  return body as XConnectionCheckResult;
}

export async function fetchXPostResultClient(
  historyId: string,
  options?: { live?: boolean },
): Promise<XPostLookupResult> {
  const params = options?.live ? "?live=1" : "";
  const response = await fetch(
    `/api/x/posts/${encodeURIComponent(historyId)}${params}`,
    { cache: "no-store" },
  );

  const body = (await response.json().catch(() => null)) as
    | XPostLookupResult
    | { message?: string }
    | null;

  if (!response.ok) {
    if (body && "status" in body) {
      return body as XPostLookupResult;
    }
    throw new Error(
      (body && "message" in body && body.message) ||
        "投稿結果の取得に失敗しました",
    );
  }

  return body as XPostLookupResult;
}

export async function fetchXPostHistoryClient(): Promise<XPostHistoryResult> {
  const response = await fetch("/api/x/posts/history", { cache: "no-store" });

  if (!response.ok) {
    const known = (await parseXPostErrorResponse(
      response,
    )) as XPostHistoryResult | null;
    if (known) return known;
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(body?.message ?? "投稿履歴の取得に失敗しました");
  }

  return response.json() as Promise<XPostHistoryResult>;
}

export async function fetchXScheduledPostsClient(): Promise<XScheduledPostsResult> {
  const response = await fetch("/api/x/posts/scheduled", { cache: "no-store" });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
      status?: string;
    } | null;
    if (body?.status === "feature_disabled") {
      return {
        status: "feature_disabled",
        message: body.message ?? "X連携は現在ご利用いただけません",
      };
    }
    throw new Error(body?.message ?? "予約投稿の取得に失敗しました");
  }

  return response.json() as Promise<XScheduledPostsResult>;
}

export async function fetchXDraftPostsClient(): Promise<XDraftPostsResult> {
  const response = await fetch("/api/x/posts/drafts", { cache: "no-store" });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
      status?: string;
    } | null;
    if (body?.status === "feature_disabled") {
      return {
        status: "feature_disabled",
        message: body.message ?? "X連携は現在ご利用いただけません",
      };
    }
    throw new Error(body?.message ?? "下書きの取得に失敗しました");
  }

  return response.json() as Promise<XDraftPostsResult>;
}

export async function deleteXDraftClient(draftId: string): Promise<void> {
  const response = await fetch(
    `/api/x/posts/drafts?id=${encodeURIComponent(draftId)}`,
    { method: "DELETE" },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(body?.message ?? "下書きの削除に失敗しました");
  }
}

export async function validateXPostTextClient(
  text: string,
): Promise<XPostValidationSummary> {
  const response = await fetch("/api/x/posts/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    throw new Error("投稿内容の検証に失敗しました");
  }

  const body = (await response.json()) as { validation: XPostValidationSummary };
  return body.validation;
}

export function formatXPostMode(mode: XPostMode): string {
  switch (mode) {
    case "immediate":
      return "今すぐ投稿";
    case "scheduled":
      return "予約投稿";
    case "auto":
      return "自動投稿";
    case "test":
      return "テスト投稿";
    case "draft":
      return "下書き";
    default:
      return mode;
  }
}

export function formatXPostedAt(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
