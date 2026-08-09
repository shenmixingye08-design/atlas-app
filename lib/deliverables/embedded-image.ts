/**
 * Shared helpers for embedding real images into Word / PowerPoint (P1-08).
 * No remote fetch — data URLs or generated PNG only.
 */

import sharp from "sharp";

export const P108_PROBE_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC";

const LOGO_MAX_BYTES = 500 * 1024;

export type EmbeddedImage = {
  mime: "image/png" | "image/jpeg" | "image/webp";
  /** OOXML / docx ImageRun type (webp → png via sharp when needed). */
  docxType: "png" | "jpg";
  buffer: Buffer;
  /** pptxgenjs `data` form: `image/png;base64,...` (no `data:` prefix). */
  pptxData: string;
  dataUrl: string;
};

function normalizeType(
  raw: string,
): "png" | "jpeg" | "jpg" | "webp" | null {
  const t = raw.toLowerCase().replace("image/", "");
  if (t === "jpg" || t === "jpeg") return t === "jpeg" ? "jpeg" : "jpg";
  if (t === "png" || t === "webp") return t;
  return null;
}

/**
 * Parse a trusted data URL into embeddable bytes.
 * Rejects remote URLs and oversized payloads.
 */
export function parseEmbeddableDataUrl(
  value: string | undefined | null,
): EmbeddedImage | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("file:")) {
    return null;
  }
  const match = trimmed.match(
    /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=\s]+)$/i,
  );
  if (!match) return null;
  const kind = normalizeType(match[1] ?? "");
  if (!kind) return null;
  const base64 = (match[2] ?? "").replace(/\s+/g, "");
  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64, "base64");
  } catch {
    return null;
  }
  if (buffer.byteLength < 8 || buffer.byteLength > LOGO_MAX_BYTES) {
    return null;
  }

  const mime =
    kind === "png"
      ? "image/png"
      : kind === "webp"
        ? "image/webp"
        : "image/jpeg";
  const pptxMime = kind === "jpg" || kind === "jpeg" ? "image/jpeg" : mime;
  return {
    mime,
    docxType: kind === "png" || kind === "webp" ? "png" : "jpg",
    buffer,
    pptxData: `${pptxMime};base64,${buffer.toString("base64")}`,
    dataUrl: trimmed,
  };
}

/** Ensure docx/pptx can consume the buffer (webp → png). */
export async function materializeForOffice(
  image: EmbeddedImage,
): Promise<EmbeddedImage> {
  if (image.mime !== "image/webp") {
    return image;
  }
  const png = await sharp(image.buffer).png().toBuffer();
  return {
    mime: "image/png",
    docxType: "png",
    buffer: png,
    pptxData: `image/png;base64,${png.toString("base64")}`,
    dataUrl: `data:image/png;base64,${png.toString("base64")}`,
  };
}

/**
 * Deterministic caption card PNG — used when markdown has an image slot
 * without binary data, so we still embed a real image (not a gray shape).
 */
export async function renderCaptionPng(
  caption: string,
  options?: { marker?: string },
): Promise<EmbeddedImage> {
  const safe = (caption || "Image").slice(0, 80).replace(/[<>&"']/g, "");
  const marker = (options?.marker ?? "").slice(0, 40);
  const label = marker ? `${safe} · ${marker}` : safe;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="200" viewBox="0 0 640 200">
  <rect width="640" height="200" fill="#F7F7F7" stroke="#CCCCCC" stroke-width="2"/>
  <text x="320" y="105" text-anchor="middle" font-family="sans-serif" font-size="22" fill="#333333">${label}</text>
</svg>`;
  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return {
    mime: "image/png",
    docxType: "png",
    buffer,
    pptxData: `image/png;base64,${buffer.toString("base64")}`,
    dataUrl: `data:image/png;base64,${buffer.toString("base64")}`,
  };
}

export async function resolveEmbeddedImage(input: {
  dataUrl?: string | null;
  caption?: string;
  marker?: string;
}): Promise<EmbeddedImage> {
  const parsed = parseEmbeddableDataUrl(input.dataUrl ?? undefined);
  if (parsed) {
    return materializeForOffice(parsed);
  }
  return renderCaptionPng(input.caption ?? "Image", { marker: input.marker });
}
