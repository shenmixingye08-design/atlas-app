import type {
  GmailFilterId,
  GmailMessageAnalysis,
  GmailMessagesResult,
  GmailReplyDraftContent,
  GmailSavedReplyDraft,
} from "./types";

export type { GmailFilterId } from "./types";

async function parseGmailErrorResponse(
  response: Response,
): Promise<GmailMessagesResult | null> {
  const body = (await response.json().catch(() => null)) as {
    message?: string;
    status?: string;
  } | null;

  if (body?.status === "google_not_connected") {
    return {
      status: "google_not_connected",
      message: body.message ?? "Googleを接続してください",
    };
  }

  if (body?.status === "feature_disabled") {
    return {
      status: "feature_disabled",
      message: body.message ?? "Google連携は現在ご利用いただけません",
    };
  }

  return null;
}

export async function fetchGmailMessagesClient(
  filter: GmailFilterId,
): Promise<GmailMessagesResult> {
  const response = await fetch(
    `/api/google/gmail?filter=${encodeURIComponent(filter)}`,
    { cache: "no-store" },
  );

  if (!response.ok) {
    const known = await parseGmailErrorResponse(response);
    if (known) return known;
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(body?.message ?? "Failed to load Gmail messages");
  }

  return response.json() as Promise<GmailMessagesResult>;
}

export async function analyzeGmailMessagesClient(
  messageIds: string[],
): Promise<{ analyses: GmailMessageAnalysis[]; important: GmailMessageAnalysis[] }> {
  const response = await fetch("/api/google/gmail/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messageIds }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(body?.message ?? "Failed to analyze Gmail messages");
  }

  return response.json() as Promise<{
    analyses: GmailMessageAnalysis[];
    important: GmailMessageAnalysis[];
  }>;
}

export async function createGmailReplyDraftClient(
  messageId: string,
): Promise<GmailReplyDraftContent> {
  const response = await fetch(
    `/api/google/gmail/messages/${encodeURIComponent(messageId)}/reply-draft`,
    { method: "POST" },
  );

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(body?.message ?? "Failed to create reply draft");
  }

  const payload = (await response.json()) as { draft: GmailReplyDraftContent };
  return payload.draft;
}

export async function fetchGmailReplyDraftsClient(): Promise<GmailSavedReplyDraft[]> {
  const response = await fetch("/api/google/gmail/reply-drafts", {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to load saved reply drafts");
  }

  const payload = (await response.json()) as { drafts: GmailSavedReplyDraft[] };
  return payload.drafts;
}

export async function saveGmailReplyDraftClient(
  draft: GmailReplyDraftContent,
): Promise<GmailSavedReplyDraft> {
  const response = await fetch("/api/google/gmail/reply-drafts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(body?.message ?? "Failed to save reply draft");
  }

  const payload = (await response.json()) as { draft: GmailSavedReplyDraft };
  return payload.draft;
}

export function formatGmailReceivedAt(value: string, locale = "ja-JP"): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}
