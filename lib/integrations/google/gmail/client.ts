import type {
  GmailFilterId,
  GmailLabel,
  GmailMessageAnalysis,
  GmailMessagesResult,
  GmailPdfAnalysis,
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

  if (
    body?.status === "google_not_connected" ||
    body?.status === "feature_disabled" ||
    body?.status === "plan_required" ||
    body?.status === "insufficient_permission" ||
    body?.status === "needs_reconnect"
  ) {
    return {
      status: body.status,
      message:
        body.message ??
        (body.status === "google_not_connected"
          ? "Googleを接続してください"
          : body.status === "insufficient_permission"
            ? "必要なGoogle権限が不足しています。再接続して権限を許可してください"
            : body.status === "needs_reconnect"
              ? "Google連携の有効期限が切れました。再接続してください"
              : "Google連携は現在ご利用いただけません"),
    };
  }

  return null;
}

export async function fetchGmailMessagesClient(
  filter: GmailFilterId,
  searchQuery?: string,
): Promise<GmailMessagesResult> {
  const params = new URLSearchParams({ filter });
  if (searchQuery?.trim()) {
    params.set("q", searchQuery.trim());
  }

  const response = await fetch(`/api/google/gmail?${params.toString()}`, {
    cache: "no-store",
  });

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

export async function sendGmailReplyClient(
  draft: GmailReplyDraftContent,
): Promise<void> {
  const response = await fetch(
    `/api/google/gmail/messages/${encodeURIComponent(draft.messageId)}/send`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: draft.subject,
        to: draft.to,
        body: draft.body,
      }),
    },
  );

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(body?.message ?? "Failed to send reply");
  }
}

export async function archiveGmailMessageClient(messageId: string): Promise<void> {
  const response = await fetch(
    `/api/google/gmail/messages/${encodeURIComponent(messageId)}/archive`,
    { method: "POST" },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(body?.message ?? "Failed to archive");
  }
}

export async function spamGmailMessageClient(messageId: string): Promise<void> {
  const response = await fetch(
    `/api/google/gmail/messages/${encodeURIComponent(messageId)}/spam`,
    { method: "POST" },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(body?.message ?? "Failed to move to spam");
  }
}

export async function trashGmailMessageClient(messageId: string): Promise<void> {
  const response = await fetch(
    `/api/google/gmail/messages/${encodeURIComponent(messageId)}/trash`,
    { method: "POST" },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(body?.message ?? "Failed to delete");
  }
}

export async function fetchGmailLabelsClient(): Promise<GmailLabel[]> {
  const response = await fetch("/api/google/gmail/labels", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load labels");
  }
  const payload = (await response.json()) as {
    status: string;
    labels?: GmailLabel[];
  };
  return payload.labels ?? [];
}

export async function createGmailLabelClient(name: string): Promise<GmailLabel> {
  const response = await fetch("/api/google/gmail/labels", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(body?.message ?? "Failed to create label");
  }
  const payload = (await response.json()) as {
    status?: string;
    label?: GmailLabel;
  };
  if (!payload.label) {
    throw new Error("Failed to create label");
  }
  return payload.label;
}

export async function addGmailLabelToMessageClient(
  messageId: string,
  labelId: string,
): Promise<void> {
  const response = await fetch(
    `/api/google/gmail/messages/${encodeURIComponent(messageId)}/labels`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ labelId }),
    },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(body?.message ?? "Failed to add label");
  }
}

export async function analyzeGmailPdfClient(
  messageId: string,
  attachmentId: string,
): Promise<GmailPdfAnalysis> {
  const response = await fetch(
    `/api/google/gmail/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}/analyze`,
    { method: "POST" },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(body?.message ?? "Failed to analyze PDF");
  }
  const payload = (await response.json()) as { analysis: GmailPdfAnalysis };
  return payload.analysis;
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
