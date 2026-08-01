import { PPTX_LIMITS } from "./limits";

const UNSAFE_NAME = /[\\/:*?"<>|\u0000-\u001f]/g;

export function sanitizePptxFileName(name: string): string {
  const base = name
    .replace(/\.pptx$/i, "")
    .replace(UNSAFE_NAME, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, PPTX_LIMITS.maxFileNameLength);
  return base || "presentation";
}

export function assertSafePptxUpload(params: {
  fileName: string;
  mimeType: string;
  byteLength: number;
}): void {
  if (params.byteLength > PPTX_LIMITS.maxUploadBytes) {
    throw new Error("file_too_large");
  }
  const lower = params.fileName.toLowerCase();
  const mime = params.mimeType.toLowerCase();
  const okExt =
    lower.endsWith(".pptx") ||
    lower.endsWith(".docx") ||
    lower.endsWith(".xlsx") ||
    lower.endsWith(".pdf") ||
    lower.endsWith(".md") ||
    lower.endsWith(".txt") ||
    /\.(png|jpe?g|webp)$/.test(lower);
  if (!okExt) {
    throw new Error("unsupported_file");
  }
  if (
    lower.endsWith(".pptx") &&
    mime &&
    !mime.includes("presentation") &&
    mime !== "application/octet-stream" &&
    mime !== "application/zip"
  ) {
    throw new Error("unsupported_file");
  }
}

/** OOXML zip magic. */
export function looksLikePptxZip(buffer: Buffer): boolean {
  return buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}
