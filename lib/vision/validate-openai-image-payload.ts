import "server-only";

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { loadSharp } from "@/lib/images/load-sharp";

import { detectImageMimeFromBytes } from "@/lib/vision/image-magic";
import { inspectDataUrlIntegrity } from "@/lib/vision/data-url-integrity";
import { VisionError } from "@/lib/vision/types";

/** Only these MIME types are accepted for OpenAI Responses `input_image` data URLs. */
export const OPENAI_SAFE_IMAGE_MIMES = ["image/jpeg", "image/png"] as const;
export type OpenAiSafeImageMime = (typeof OPENAI_SAFE_IMAGE_MIMES)[number];

export type ValidatedOpenAiImagePayload = {
  dataUrl: string;
  mimeType: OpenAiSafeImageMime;
  buffer: Buffer;
  byteLength: number;
  base64Length: number;
  urlLength: number;
  width: number;
  height: number;
  /** First 32 bytes as lowercase hex (for operator logs). */
  headHex32: string;
  /** Local probe path written immediately before send (null if write skipped). */
  probePath: string | null;
  openable: true;
};

const DATA_URL_RE = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=\s]+)$/;

function headHex32(buffer: Buffer): string {
  return buffer.subarray(0, 32).toString("hex");
}

function assertMagicMatchesMime(
  buffer: Buffer,
  mimeType: OpenAiSafeImageMime,
): void {
  const detected = detectImageMimeFromBytes(buffer);
  if (detected !== mimeType) {
    throw new VisionError(
      "invalid_data_url",
      "画像の実データとMIMEタイプが一致しないため、AIへ送信しませんでした",
      {
        failedStage: "data_url",
        details: {
          safeMessage: "magic_bytes_mismatch",
          declaredMime: mimeType,
          detectedMime: detected,
          headHex32: headHex32(buffer),
        },
      },
    );
  }

  if (mimeType === "image/jpeg") {
    if (!(buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)) {
      throw new VisionError("corrupt_image", "JPEG magic bytes が不正です", {
        failedStage: "data_url",
        details: { headHex32: headHex32(buffer) },
      });
    }
  }
  if (mimeType === "image/png") {
    if (
      !(
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47
      )
    ) {
      throw new VisionError("corrupt_image", "PNG magic bytes が不正です", {
        failedStage: "data_url",
        details: { headHex32: headHex32(buffer) },
      });
    }
  }
}

/**
 * Decode + validate a data URL that is about to be sent to OpenAI.
 * Refuses anything that is not a real, openable JPEG/PNG with matching magic bytes.
 */
export async function validateOpenAiImageDataUrl(input: {
  dataUrl: string;
  diagnosticId?: string | null;
  /** When set, write probe bytes under this directory for local open checks. */
  probeDir?: string | null;
  jobId?: string | null;
}): Promise<ValidatedOpenAiImagePayload> {
  const dataUrl = input.dataUrl;
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
    throw new VisionError("invalid_data_url", "data URL 形式ではありません", {
      diagnosticId: input.diagnosticId,
      failedStage: "data_url",
    });
  }

  const integrity = inspectDataUrlIntegrity(dataUrl);
  if (!integrity.ok) {
    throw new VisionError(
      "invalid_data_url",
      `data URL が破損しています: ${integrity.issues.map((i) => i.code).join(",")}`,
      {
        diagnosticId: input.diagnosticId,
        failedStage: "data_url",
        details: {
          safeMessage: integrity.issues.map((i) => i.code).join(","),
          hasDataPrefixDuplicate: integrity.hasDataPrefixDuplicate,
          looksDoubleBase64Encoded: integrity.looksDoubleBase64Encoded,
          plusBecameSpace: integrity.plusBecameSpace,
          urlEncoded: integrity.urlEncoded,
          hasWhitespaceInBase64: integrity.hasWhitespaceInBase64,
          headerPreview: (integrity.header ?? "").slice(0, 80),
        },
      },
    );
  }

  // Reject image/jpg, webp, heic, charset params, missing base64 marker, etc.
  const match = DATA_URL_RE.exec(dataUrl);
  if (!match) {
    const header = dataUrl.slice(0, dataUrl.indexOf(",") >= 0 ? dataUrl.indexOf(",") : 64);
    throw new VisionError(
      "invalid_data_url",
      "OpenAI送信用 data URL は data:image/jpeg;base64,... または data:image/png;base64,... のみ許可です",
      {
        diagnosticId: input.diagnosticId,
        failedStage: "data_url",
        details: {
          safeMessage: "data_url_header_rejected",
          headerPreview: header.slice(0, 80),
        },
      },
    );
  }

  const mimeType = match[1] as OpenAiSafeImageMime;
  const base64Raw = match[2] ?? "";
  // Strip whitespace only — never decode as UTF-8 text.
  const base64 = base64Raw.replace(/\s+/g, "");
  if (!base64 || base64.length < 32) {
    throw new VisionError("empty_image", "Base64 画像データが空です", {
      diagnosticId: input.diagnosticId,
      failedStage: "data_url",
    });
  }
  if (!/^[A-Za-z0-9+/]+=*$/.test(base64)) {
    throw new VisionError("invalid_data_url", "Base64 に不正な文字が含まれています", {
      diagnosticId: input.diagnosticId,
      failedStage: "data_url",
    });
  }

  // Critical: binary decode only. Never Buffer.from(str, "utf8").
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length < 12) {
    throw new VisionError("empty_image", "デコード後の画像が空です", {
      diagnosticId: input.diagnosticId,
      failedStage: "data_url",
      details: { byteLength: buffer.length, headHex32: headHex32(buffer) },
    });
  }

  // Magic bytes before size thresholds — catch MIME spoof (OpenAI 400 root cause).
  assertMagicMatchesMime(buffer, mimeType);

  if (buffer.length < 64) {
    throw new VisionError("empty_image", "デコード後の画像が小さすぎます", {
      diagnosticId: input.diagnosticId,
      failedStage: "data_url",
      details: { byteLength: buffer.length, headHex32: headHex32(buffer) },
    });
  }

  // Round-trip sanity: re-encoding to base64 must match (catches Buffer corruption).
  if (buffer.toString("base64") !== base64) {
    throw new VisionError(
      "invalid_data_url",
      "Base64 の往復検証に失敗しました（データ破損の可能性）",
      {
        diagnosticId: input.diagnosticId,
        failedStage: "data_url",
        details: {
          safeMessage: "base64_roundtrip_mismatch",
          base64Length: base64.length,
          byteLength: buffer.length,
        },
      },
    );
  }

  let width = 0;
  let height = 0;
  const sharp = await loadSharp();
  try {
    const meta = await sharp(buffer, { failOn: "error" }).metadata();
    width = meta.width ?? 0;
    height = meta.height ?? 0;
    const format = meta.format;
    if (
      (mimeType === "image/jpeg" && format !== "jpeg") ||
      (mimeType === "image/png" && format !== "png")
    ) {
      throw new Error(`sharp_format_mismatch format=${format} mime=${mimeType}`);
    }
    if (!width || !height) {
      throw new Error("missing_dimensions");
    }
  } catch (error) {
    throw new VisionError(
      "corrupt_image",
      "画像として開けないため AI へ送信しませんでした",
      {
        diagnosticId: input.diagnosticId,
        failedStage: "data_url",
        details: {
          safeMessage:
            error instanceof Error ? error.message.slice(0, 200) : "sharp_open_failed",
          mimeType,
          byteLength: buffer.length,
          headHex32: headHex32(buffer),
        },
        cause: error,
      },
    );
  }

  let probePath: string | null = null;
  const probeDir =
    input.probeDir ??
    process.env.VISION_IMAGE_PROBE_DIR ??
    "/tmp/atlas-vision-image-probes";
  try {
    mkdirSync(probeDir, { recursive: true });
    const ext = mimeType === "image/png" ? "png" : "jpg";
    const name = `pre-send_${input.diagnosticId ?? "nodiag"}_${Date.now()}.${ext}`;
    probePath = join(probeDir, name);
    writeFileSync(probePath, buffer);
    // Re-read from disk — must still be openable (Windows/Mac/phone parity).
    const fromDisk = readFileSync(probePath);
    if (!fromDisk.equals(buffer)) {
      throw new Error("probe_disk_bytes_mismatch");
    }
    await sharp(fromDisk, { failOn: "error" }).metadata();
  } catch (error) {
    throw new VisionError(
      "corrupt_image",
      "ローカル保存した画像を開けないため AI へ送信しませんでした",
      {
        diagnosticId: input.diagnosticId,
        failedStage: "data_url",
        details: {
          safeMessage:
            error instanceof Error ? error.message.slice(0, 200) : "probe_write_failed",
          probePath,
          headHex32: headHex32(buffer),
        },
        cause: error,
      },
    );
  }

  const validated: ValidatedOpenAiImagePayload = {
    dataUrl: `data:${mimeType};base64,${base64}`,
    mimeType,
    buffer,
    byteLength: buffer.length,
    base64Length: base64.length,
    urlLength: dataUrl.length,
    width,
    height,
    headHex32: headHex32(buffer),
    probePath,
    openable: true,
  };

  console.info("[vision] pre_send_image_validation", {
    diagnosticId: input.diagnosticId ?? null,
    jobId: input.jobId ?? null,
    ok: true,
    mimeType: validated.mimeType,
    imageByteLength: validated.byteLength,
    bufferSize: validated.byteLength,
    base64Length: validated.base64Length,
    urlLength: validated.urlLength,
    width: validated.width,
    height: validated.height,
    headHex32: validated.headHex32,
    probePath: validated.probePath,
    dataUrlPrefix: validated.dataUrl.slice(0, `data:${mimeType};base64,`.length),
  });

  return validated;
}

/** Build a safe OpenAI data URL from raw bytes — MIME from magic only. */
export function buildOpenAiDataUrlFromBuffer(buffer: Buffer): {
  dataUrl: string;
  mimeType: OpenAiSafeImageMime;
} {
  const detected = detectImageMimeFromBytes(buffer);
  if (detected !== "image/jpeg" && detected !== "image/png") {
    throw new VisionError(
      "invalid_data_url",
      "OpenAI送信は JPEG/PNG のみです（実データから判定）",
      {
        failedStage: "data_url",
        details: {
          detectedMime: detected,
          headHex32: headHex32(buffer),
        },
      },
    );
  }
  // Binary → base64 only (never utf8).
  const base64 = buffer.toString("base64");
  return {
    mimeType: detected,
    dataUrl: `data:${detected};base64,${base64}`,
  };
}
