/**
 * Build a Content-Disposition header that works across browsers, including
 * Android Chrome with Japanese filenames (RFC 5987 filename*).
 *
 * Always `attachment` — never leave disposition to the browser (inline/text).
 */
export function buildAttachmentContentDisposition(fileName: string): string {
  const trimmed = fileName.trim() || "download.bin";
  let asciiFallback =
    trimmed
      .normalize("NFKD")
      .replace(/[^\x20-\x7E]/g, "_")
      .replace(/["\\]/g, "_")
      .replace(/\s+/g, " ")
      .trim() || "download";

  // Preserve a real extension on the ASCII fallback (critical for .docx).
  const extMatch = trimmed.match(/(\.[A-Za-z0-9]{1,8})$/);
  if (extMatch && !asciiFallback.toLowerCase().endsWith(extMatch[1]!.toLowerCase())) {
    asciiFallback = `${asciiFallback}${extMatch[1]}`;
  }
  if (asciiFallback === "." || asciiFallback.startsWith(".")) {
    asciiFallback = `download${extMatch?.[1] ?? ""}`;
  }

  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(trimmed)}`;
}
