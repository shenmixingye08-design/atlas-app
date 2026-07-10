import type {
  DriveCategoryId,
  DriveFilesResult,
  DriveSaveResult,
} from "./types";

export { DRIVE_CATEGORY_FOLDERS } from "./constants";
export type { DriveCategoryId } from "./types";

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
}): Promise<DriveFilesResult> {
  const params = new URLSearchParams();
  if (input.category) params.set("category", input.category);
  if (input.query?.trim()) params.set("q", input.query.trim());

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
