import "server-only";

/**
 * Normalize uploaded images for OpenAI Vision.
 * HEIC/HEIF → JPEG via sharp when possible.
 */
export async function normalizeImageForVision(input: {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}): Promise<
  | { ok: true; buffer: Buffer; mimeType: string; fileName: string }
  | { ok: false; message: string }
> {
  const mime = input.mimeType.toLowerCase();
  const isHeic =
    mime === "image/heic" ||
    mime === "image/heif" ||
    /\.(heic|heif)$/i.test(input.fileName);

  if (!isHeic) {
    if (
      mime === "image/jpeg" ||
      mime === "image/png" ||
      mime === "image/webp" ||
      mime === "image/gif"
    ) {
      return {
        ok: true,
        buffer: input.buffer,
        mimeType: mime,
        fileName: input.fileName,
      };
    }
    // Unknown image/* — pass through; OpenAI may reject later.
    if (mime.startsWith("image/")) {
      return {
        ok: true,
        buffer: input.buffer,
        mimeType: mime,
        fileName: input.fileName,
      };
    }
    return {
      ok: false,
      message:
        "このファイル形式には対応していません。JPEG / PNG / WebP / HEIC の画像を添付してください。",
    };
  }

  try {
    const sharp = (await import("sharp")).default;
    const converted = await sharp(input.buffer).rotate().jpeg({ quality: 85 }).toBuffer();
    const nextName = input.fileName.replace(/\.(heic|heif)$/i, ".jpg");
    return {
      ok: true,
      buffer: converted,
      mimeType: "image/jpeg",
      fileName: nextName.endsWith(".jpg") ? nextName : `${nextName}.jpg`,
    };
  } catch (error) {
    console.error("[attachments] HEIC conversion failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return {
      ok: false,
      message:
        "HEIC画像を変換できませんでした。JPEGまたはPNGに変換して再度添付してください。",
    };
  }
}
