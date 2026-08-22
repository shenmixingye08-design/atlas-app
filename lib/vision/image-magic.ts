import "server-only";

/** Detect real image MIME from magic bytes — never trust extension alone. */
export function detectImageMimeFromBytes(buffer: Buffer): string | null {
  if (!buffer || buffer.length < 12) return null;

  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  // PNG
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }
  // WEBP (RIFF....WEBP)
  if (
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  // GIF
  const gif = buffer.toString("ascii", 0, 6);
  if (gif === "GIF87a" || gif === "GIF89a") {
    return "image/gif";
  }
  // HEIC/HEIF (ftyp....)
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

export function assertMimeMatchesBytes(
  declaredMime: string,
  buffer: Buffer,
): { ok: true; detected: string } | { ok: false; detected: string | null; reason: string } {
  const detected = detectImageMimeFromBytes(buffer);
  const normalizedDeclared =
    declaredMime.toLowerCase() === "image/jpg"
      ? "image/jpeg"
      : declaredMime.toLowerCase();

  if (!detected) {
    return {
      ok: false,
      detected: null,
      reason: "magic_bytes_unrecognized",
    };
  }
  if (
    detected === "image/heic" &&
    (normalizedDeclared === "image/heic" || normalizedDeclared === "image/heif")
  ) {
    return { ok: true, detected };
  }
  if (detected !== normalizedDeclared) {
    const allowlisted = new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/gif",
    ]);
    if (allowlisted.has(detected)) {
      return { ok: true, detected };
    }
    return {
      ok: false,
      detected,
      reason: `mime_mismatch declared=${normalizedDeclared} detected=${detected}`,
    };
  }
  return { ok: true, detected };
}
