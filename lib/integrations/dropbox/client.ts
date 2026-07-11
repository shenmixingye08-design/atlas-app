import type {
  DropboxAiSummary,
  DropboxFileItem,
  DropboxFilesResult,
  DropboxMutationResult,
  DropboxPdfAnalysis,
  DropboxShareResult,
} from "./types";

export type { DropboxFileItem, DropboxFilesResult } from "./types";

async function parseDropboxError(
  response: Response,
): Promise<DropboxFilesResult | null> {
  const body = (await response.json().catch(() => null)) as {
    message?: string;
    status?: string;
  } | null;

  if (body?.status === "dropbox_not_connected") {
    return {
      status: "dropbox_not_connected",
      message: body.message ?? "Dropboxを接続してください",
    };
  }

  if (body?.status === "feature_disabled") {
    return {
      status: "feature_disabled",
      message: body.message ?? "Dropbox連携は現在ご利用いただけません",
    };
  }

  return null;
}

export async function fetchDropboxFilesClient(input?: {
  path?: string;
  query?: string;
}): Promise<DropboxFilesResult> {
  const params = new URLSearchParams();
  if (input?.path?.trim()) params.set("path", input.path.trim());
  if (input?.query?.trim()) params.set("q", input.query.trim());

  const response = await fetch(`/api/dropbox?${params.toString()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    const known = await parseDropboxError(response);
    if (known) return known;
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(body?.message ?? "Failed to load Dropbox files");
  }

  return response.json() as Promise<DropboxFilesResult>;
}

export async function uploadDropboxFileClient(input: {
  file: File;
  parentPath?: string;
}): Promise<DropboxMutationResult> {
  const form = new FormData();
  form.set("file", input.file);
  if (input.parentPath) form.set("parentPath", input.parentPath);

  const response = await fetch("/api/dropbox/upload", {
    method: "POST",
    body: form,
  });
  return response.json();
}

export async function deleteDropboxFileClient(input: {
  path: string;
}): Promise<
  | { status: "ready"; path: string; file: DropboxFileItem | null }
  | DropboxFilesResult
> {
  const response = await fetch("/api/dropbox/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return response.json();
}

export function getDropboxDownloadUrl(path: string): string {
  return `/api/dropbox/download?path=${encodeURIComponent(path)}`;
}

export async function shareDropboxFileClient(input: {
  path: string;
}): Promise<DropboxShareResult> {
  const response = await fetch("/api/dropbox/share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return response.json();
}

export async function summarizeDropboxFileClient(input: {
  path: string;
}): Promise<
  | { status: "ready"; summary: DropboxAiSummary }
  | DropboxFilesResult
  | { status: "not_found"; message: string }
> {
  const response = await fetch("/api/dropbox/ai/summarize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return response.json();
}

export async function analyzeDropboxPdfClient(input: {
  path: string;
}): Promise<
  | { status: "ready"; analysis: DropboxPdfAnalysis }
  | DropboxFilesResult
  | { status: "not_found"; message: string }
  | { status: "unsupported"; message: string }
> {
  const response = await fetch("/api/dropbox/ai/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return response.json();
}

export function formatDropboxKindLabel(kind: DropboxFileItem["kind"]): string {
  switch (kind) {
    case "folder":
      return "フォルダ";
    case "pdf":
      return "PDF";
    case "word":
      return "Word";
    case "excel":
      return "Excel";
    case "powerpoint":
      return "PowerPoint";
    default:
      return "その他";
  }
}

export function formatDropboxModifiedAt(
  value: string | null,
  locale = "ja-JP",
): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function formatDropboxFileSize(sizeBytes: number | null): string {
  if (sizeBytes === null || Number.isNaN(sizeBytes)) return "—";
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}
