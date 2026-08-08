import { createHash } from "crypto";

import {
  assertImageMagicMatchesDeclaration,
  looksLikeSvgOrHtml,
} from "@/lib/security/file-magic";
import { sanitizeDisplayFileName } from "@/lib/security/upload-path";

import { RECEIPT_PIPELINE_EVALUATION } from "./feature-evaluation";
import type { MediaImageInput } from "./types";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

export function isAllowedImageMime(mime: string): boolean {
  return ALLOWED_MIME.has(mime.toLowerCase());
}

export function hashImageBytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function prepareMediaImages(
  files: Array<{ filename: string; mimeType: string; bytes: Buffer }>,
): Promise<MediaImageInput[]> {
  if (files.length === 0) {
    throw new Error("画像がありません");
  }
  if (files.length > RECEIPT_PIPELINE_EVALUATION.maxImagesPerRequest) {
    throw new Error(
      `一度に処理できる画像は${RECEIPT_PIPELINE_EVALUATION.maxImagesPerRequest}枚までです`,
    );
  }

  return files.map((file, index) => {
    let filename: string;
    try {
      filename = sanitizeDisplayFileName(file.filename);
    } catch {
      throw new Error("不正なファイル名です");
    }
    if (file.bytes.length <= 0) {
      throw new Error(`画像ファイルが空です: ${filename}`);
    }
    if (file.bytes.length > RECEIPT_PIPELINE_EVALUATION.maxImageBytes) {
      throw new Error(`画像が大きすぎます: ${filename}`);
    }
    if (looksLikeSvgOrHtml(file.bytes)) {
      throw new Error("SVG/HTML 画像は処理できません");
    }
    const declared = file.mimeType || "image/jpeg";
    if (!isAllowedImageMime(declared) && !/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(filename)) {
      throw new Error(`対応していない画像形式です: ${filename}`);
    }
    let mime: string;
    try {
      mime = assertImageMagicMatchesDeclaration({
        declaredMime: isAllowedImageMime(declared) ? declared : "image/jpeg",
        fileName: filename,
        buffer: file.bytes,
      }).mime;
    } catch {
      throw new Error(`画像形式を確認できませんでした: ${filename}`);
    }
    const contentHash = hashImageBytes(file.bytes);
    const dataUrl = `data:${mime};base64,${file.bytes.toString("base64")}`;
    return {
      id: `img_${contentHash.slice(0, 12)}_${index}`,
      filename,
      mimeType: mime,
      bytes: file.bytes,
      dataUrl,
      contentHash,
    };
  });
}
