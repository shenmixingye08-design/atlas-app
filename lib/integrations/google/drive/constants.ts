export const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";

export const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";

export const ATLAS_DRIVE_ROOT = "ATLAS";

export const DRIVE_LIST_MAX_RESULTS = 50;

export const DRIVE_CATEGORY_FOLDERS: Record<
  import("./types").DriveCategoryId,
  string
> = {
  sales_material: "営業資料",
  blog: "ブログ",
  sns: "SNS",
  email: "メール",
  other: "その他",
};

export const SUPPORTED_DRIVE_FORMATS = [
  "pdf",
  "docx",
  "pptx",
  "md",
  "txt",
  "xlsx",
] as const;

export type SupportedDriveFormat = (typeof SUPPORTED_DRIVE_FORMATS)[number];

export const DRIVE_FORMAT_MIME_TYPES: Record<SupportedDriveFormat, string> = {
  pdf: "application/pdf",
  docx:
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx:
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  md: "text/markdown; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export const GOOGLE_APPS_MIME = {
  folder: "application/vnd.google-apps.folder",
  document: "application/vnd.google-apps.document",
  spreadsheet: "application/vnd.google-apps.spreadsheet",
  presentation: "application/vnd.google-apps.presentation",
} as const;

export const OFFICE_MIME = {
  word: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  excel: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  powerpoint:
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  pdf: "application/pdf",
} as const;

export function buildDriveFileUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

export function buildDriveFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
}

export function sanitizeDriveFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, "-").trim();
  return cleaned.slice(0, 200) || "untitled";
}

export function resolveDriveDocumentKind(
  mimeType: string,
): import("./types").DriveDocumentKind {
  if (mimeType === GOOGLE_APPS_MIME.folder) return "folder";
  if (mimeType === GOOGLE_APPS_MIME.document) return "google_doc";
  if (mimeType === GOOGLE_APPS_MIME.spreadsheet) return "google_sheet";
  if (mimeType === GOOGLE_APPS_MIME.presentation) return "google_slide";
  if (mimeType === OFFICE_MIME.pdf || mimeType === "application/pdf") {
    return "pdf";
  }
  if (
    mimeType === OFFICE_MIME.word ||
    mimeType === "application/msword"
  ) {
    return "word";
  }
  if (
    mimeType === OFFICE_MIME.excel ||
    mimeType === "application/vnd.ms-excel"
  ) {
    return "excel";
  }
  if (
    mimeType === OFFICE_MIME.powerpoint ||
    mimeType === "application/vnd.ms-powerpoint"
  ) {
    return "powerpoint";
  }
  return "other";
}
