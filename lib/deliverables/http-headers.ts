/** Build a Content-Disposition that keeps Japanese filenames intact. */
export function buildContentDisposition(fileName: string): string {
  const fallback = fileName
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(fileName).replace(/['()]/g, escape);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
