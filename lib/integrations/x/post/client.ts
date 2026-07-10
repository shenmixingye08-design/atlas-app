import type {
  XPostHistoryRecord,
  XPostHistoryResult,
  XPostMode,
  XPostResult,
  XPostValidationSummary,
  XScheduledPost,
  XScheduledPostsResult,
} from "./types";

export type {
  XPostHistoryRecord,
  XPostHistoryResult,
  XPostMode,
  XPostResult,
  XPostValidationSummary,
  XScheduledPost,
  XScheduledPostsResult,
};

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

  return null;
}

export async function createXPostClient(input: {
  text: string;
  mode: XPostMode;
  scheduledFor?: string | null;
  automationId?: string | null;
}): Promise<XPostResult> {
  const response = await fetch("/api/x/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const known = await parseXPostErrorResponse(response);
    if (known) return known;
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(body?.message ?? "Xへの投稿に失敗しました");
  }

  return response.json() as Promise<XPostResult>;
}

export async function fetchXPostHistoryClient(): Promise<XPostHistoryResult> {
  const response = await fetch("/api/x/posts/history", { cache: "no-store" });

  if (!response.ok) {
    const known = (await parseXPostErrorResponse(response)) as XPostHistoryResult | null;
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
