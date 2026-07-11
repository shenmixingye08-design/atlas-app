import type {
  DriveAiClassification,
  DriveAiSearchHit,
  DriveAiSummary,
  DriveCategoryId,
  DriveFileItem,
  DriveFilesResult,
  DriveFolderItem,
  DriveFolderLayout,
  DriveSaveResult,
} from "./types";

export { DRIVE_CATEGORY_FOLDERS } from "./constants";
export type { DriveCategoryId, DriveFileItem } from "./types";

async function parseDriveErrorResponse(
  response: Response,
): Promise<DriveFilesResult | null> {
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

export async function fetchGoogleDriveFilesClient(input: {
  category?: DriveCategoryId | "all";
  query?: string;
  parentId?: string;
}): Promise<DriveFilesResult> {
  const params = new URLSearchParams();
  if (input.category) params.set("category", input.category);
  if (input.query?.trim()) params.set("q", input.query.trim());
  if (input.parentId?.trim()) params.set("parentId", input.parentId.trim());

  const response = await fetch(`/api/google/drive?${params.toString()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    const known = await parseDriveErrorResponse(response);
    if (known) return known;
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(body?.message ?? "Failed to load Google Drive files");
  }

  return response.json() as Promise<DriveFilesResult>;
}

export async function searchGoogleDriveClient(input: {
  query: string;
  parentId?: string;
}): Promise<DriveFilesResult> {
  const params = new URLSearchParams({ q: input.query.trim() });
  if (input.parentId?.trim()) params.set("parentId", input.parentId.trim());

  const response = await fetch(`/api/google/drive/search?${params.toString()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    const known = await parseDriveErrorResponse(response);
    if (known) return known;
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(body?.message ?? "Failed to search Google Drive");
  }

  return response.json() as Promise<DriveFilesResult>;
}

export async function fetchRecentGoogleDriveFilesClient(input?: {
  limit?: number;
}): Promise<
  | { status: "ready"; files: DriveFileItem[]; generatedAt: string }
  | DriveFilesResult
> {
  const params = new URLSearchParams();
  if (input?.limit) params.set("limit", String(input.limit));

  const response = await fetch(
    `/api/google/drive/recent?${params.toString()}`,
    { cache: "no-store" },
  );

  if (!response.ok) {
    const known = await parseDriveErrorResponse(response);
    if (known) return known;
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(body?.message ?? "Failed to load recent Drive files");
  }

  return response.json();
}

export async function fetchGoogleDriveFoldersClient(input?: {
  parentId?: string;
}): Promise<
  | {
      status: "ready";
      parentId: string;
      folders: DriveFolderItem[];
      layout: DriveFolderLayout;
    }
  | DriveFilesResult
> {
  const params = new URLSearchParams();
  if (input?.parentId?.trim()) params.set("parentId", input.parentId.trim());

  const response = await fetch(
    `/api/google/drive/folders?${params.toString()}`,
    { cache: "no-store" },
  );

  if (!response.ok) {
    const known = await parseDriveErrorResponse(response);
    if (known) return known;
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(body?.message ?? "Failed to load Drive folders");
  }

  return response.json();
}

export async function saveDeliverableToDriveClient(input: {
  deliverableId: string;
  category?: DriveCategoryId;
  overwriteFileId?: string;
}): Promise<DriveSaveResult> {
  const response = await fetch("/api/google/drive/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const body = (await response.json()) as DriveSaveResult;

  if (!response.ok) {
    if (
      body.status === "google_not_connected" ||
      body.status === "feature_disabled" ||
      body.status === "not_found" ||
      body.status === "unsupported_format"
    ) {
      return body;
    }
    throw new Error(
      "message" in body ? body.message : "Failed to save to Google Drive",
    );
  }

  return body;
}

export async function uploadGoogleDriveFileClient(input: {
  file: File;
  parentId?: string;
  category?: DriveCategoryId;
}): Promise<DriveSaveResult> {
  const form = new FormData();
  form.set("file", input.file);
  if (input.parentId) form.set("parentId", input.parentId);
  if (input.category) form.set("category", input.category);

  const response = await fetch("/api/google/drive/upload", {
    method: "POST",
    body: form,
  });

  const body = (await response.json()) as DriveSaveResult;
  if (!response.ok && body.status !== "ready") {
    if (
      body.status === "google_not_connected" ||
      body.status === "feature_disabled" ||
      body.status === "not_found" ||
      body.status === "unsupported_format"
    ) {
      return body;
    }
    throw new Error(
      "message" in body ? body.message : "Failed to upload to Google Drive",
    );
  }

  return body;
}

export function getGoogleDriveDownloadUrl(fileId: string): string {
  return `/api/google/drive/download/${encodeURIComponent(fileId)}`;
}

export async function moveGoogleDriveFileClient(input: {
  fileId: string;
  destinationFolderId: string;
}): Promise<{ status: "ready"; file: DriveFileItem } | DriveFilesResult> {
  const response = await fetch("/api/google/drive/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await response.json();
  if (!response.ok) {
    const known = await Promise.resolve(
      body?.status === "google_not_connected" || body?.status === "feature_disabled"
        ? (body as DriveFilesResult)
        : null,
    );
    if (known) return known;
    throw new Error(body?.message ?? "Failed to move file");
  }
  return body;
}

export async function copyGoogleDriveFileClient(input: {
  fileId: string;
  destinationFolderId?: string;
  newName?: string;
}): Promise<{ status: "ready"; file: DriveFileItem } | DriveFilesResult> {
  const response = await fetch("/api/google/drive/copy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await response.json();
  if (!response.ok) {
    if (
      body?.status === "google_not_connected" ||
      body?.status === "feature_disabled"
    ) {
      return body as DriveFilesResult;
    }
    throw new Error(body?.message ?? "Failed to copy file");
  }
  return body;
}

export async function deleteGoogleDriveFileClient(input: {
  fileId: string;
}): Promise<{ status: "ready"; fileId: string } | DriveFilesResult> {
  const response = await fetch("/api/google/drive/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await response.json();
  if (!response.ok) {
    if (
      body?.status === "google_not_connected" ||
      body?.status === "feature_disabled"
    ) {
      return body as DriveFilesResult;
    }
    throw new Error(body?.message ?? "Failed to delete file");
  }
  return body;
}

export async function summarizeGoogleDriveFileClient(input: {
  fileId: string;
}): Promise<
  | { status: "ready"; summary: DriveAiSummary }
  | DriveFilesResult
  | { status: "not_found"; message: string }
> {
  const response = await fetch("/api/google/drive/ai/summarize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return response.json();
}

export async function aiSearchGoogleDriveClient(input: {
  query: string;
  category?: DriveCategoryId | "all";
}): Promise<
  | { status: "ready"; hits: DriveAiSearchHit[]; query: string }
  | DriveFilesResult
> {
  const response = await fetch("/api/google/drive/ai/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return response.json();
}

export async function classifyGoogleDriveFileClient(input: {
  fileId: string;
}): Promise<
  | { status: "ready"; classification: DriveAiClassification }
  | DriveFilesResult
  | { status: "not_found"; message: string }
> {
  const response = await fetch("/api/google/drive/ai/classify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return response.json();
}

export function formatDriveModifiedAt(value: string, locale = "ja-JP"): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function formatDriveFileSize(sizeBytes: number | null): string {
  if (sizeBytes === null || Number.isNaN(sizeBytes)) return "—";
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDriveKindLabel(kind: DriveFileItem["kind"]): string {
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
    case "google_doc":
      return "Google Docs";
    case "google_sheet":
      return "Google Sheets";
    case "google_slide":
      return "Google Slides";
    default:
      return "その他";
  }
}
