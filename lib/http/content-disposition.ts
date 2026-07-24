/**
 * Build a Content-Disposition header that works across browsers, including
 * Android Chrome with Japanese filenames (RFC 5987 filename*).
 */
export function buildAttachmentContentDisposition(fileName: string): string {
  const trimmed = fileName.trim() || "download";
  const asciiFallback =
    trimmed
      .normalize("NFKD")
      .replace(/[^\x20-\x7E]/g, "_")
      .replace(/["\\]/g, "_")
      .replace(/\s+/g, " ")
      .trim() || "download";

  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(trimmed)}`;
}
