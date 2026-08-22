/**
 * Magic-byte detectors for upload gates (no server-only — usable in tests).
 */

export function detectImageMimeFromBytes(buffer: Buffer): string | null {
  if (!buffer || buffer.length < 12) return null;

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  const gif = buffer.toString("ascii", 0, 6);
  if (gif === "GIF87a" || gif === "GIF89a") {
    return "image/gif";
  }
  if (buffer.toString("ascii", 4, 8) === "ftyp") {
    const brand = buffer.toString("ascii", 8, 12);
    if (
      /heic|heif|mif1|msf1|hevc|hevx/i.test(brand) ||
      buffer.toString("ascii", 8, 16).includes("heic")
    ) {
      return "image/heic";
    }
  }
  return null;
}

export function looksLikeSvgOrHtml(buffer: Buffer): boolean {
  if (!buffer || buffer.length === 0) return false;
  const head = buffer
    .subarray(0, Math.min(buffer.length, 256))
    .toString("utf8")
    .replace(/^\uFEFF/, "")
    .trimStart()
    .toLowerCase();
  if (head.startsWith("<svg") || head.includes("<svg")) return true;
  if (head.startsWith("<!doctype html") || head.startsWith("<html")) return true;
  if (head.startsWith("<?xml") && head.includes("<svg")) return true;
  if (head.includes("<script")) return true;
  return false;
}

export function detectDocumentKindFromBytes(
  buffer: Buffer,
): "pdf" | "ooxml_zip" | "ole" | "text" | null {
  if (!buffer || buffer.length < 4) return null;
  if (buffer.toString("ascii", 0, 5) === "%PDF-") return "pdf";
  // ZIP (docx/xlsx/pptx)
  if (
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07) &&
    (buffer[3] === 0x04 || buffer[3] === 0x06 || buffer[3] === 0x08)
  ) {
    return "ooxml_zip";
  }
  // OLE (legacy doc/xls/ppt)
  if (
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0
  ) {
    return "ole";
  }
  // UTF-8 / ASCII text-ish
  const sample = buffer.subarray(0, Math.min(buffer.length, 64));
  if (sample.every((b) => b === 0x09 || b === 0x0a || b === 0x0d || (b >= 0x20 && b < 0x7f))) {
    return "text";
  }
  return null;
}

export function assertImageMagicMatchesDeclaration(input: {
  declaredMime: string;
  fileName?: string;
  buffer: Buffer;
}): { mime: string } {
  if (looksLikeSvgOrHtml(input.buffer)) {
    throw new Error("svg_or_html_rejected");
  }
  const detected = detectImageMimeFromBytes(input.buffer);
  if (!detected) {
    throw new Error("magic_bytes_unrecognized");
  }
  const declared =
    input.declaredMime.toLowerCase() === "image/jpg"
      ? "image/jpeg"
      : input.declaredMime.toLowerCase();

  if (
    detected === "image/heic" &&
    (declared === "image/heic" || declared === "image/heif")
  ) {
    return { mime: detected };
  }
  if (detected !== declared) {
    // Signature wins when the bytes are a real allowlisted image.
    // Fail closed for non-images (exe/html/unknown) even if the browser said JPEG.
    const allowlisted = new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/gif",
    ]);
    if (allowlisted.has(detected)) {
      return { mime: detected };
    }
    throw new Error(
      `mime_mismatch declared=${declared} detected=${detected}`,
    );
  }
  return { mime: detected };
}
