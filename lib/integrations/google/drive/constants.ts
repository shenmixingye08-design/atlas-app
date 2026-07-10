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
};

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
