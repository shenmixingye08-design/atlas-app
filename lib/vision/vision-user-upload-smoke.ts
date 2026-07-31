import "server-only";

import sharp from "sharp";

import { uploadUserImages } from "@/lib/attachments";
import {
  deleteImageAttachment,
  readProcessedImageBytes,
} from "@/lib/attachments/store";
import { getHealthVersionPayload } from "@/lib/health/version-info";
import { isOpenAIConfigured } from "@/lib/openai";
import { analyzeUserImage } from "@/lib/vision/analyze-image";
import { detectImageMimeFromBytes } from "@/lib/vision/image-magic";
import { logVisionPipeline } from "@/lib/vision/pipeline-log";

/**
 * Production smoke for the REAL user-upload path:
 * buffer → uploadUserImages (preprocess + storage) → analyzeUserImage
 * → Files API / Responses (same as authenticated user attachments).
 */
export type VisionUserUploadSmokeResult = {
  ok: boolean;
  stage: string;
  environment: string;
  commitSha: string;
  attachmentId: string | null;
  diagnosticId: string | null;
  detectedType: string | null;
  summaryPreview: string | null;
  model: string | null;
  cached: boolean | null;
  storage: {
    byteLength: number | null;
    mimeType: string | null;
    detectedMime: string | null;
    headHex32: string | null;
    sharpOpenable: boolean | null;
    width: number | null;
    height: number | null;
  };
  stages: {
    upload: boolean;
    storageRead: boolean;
    storageOpenable: boolean;
    visionAnalyze: boolean;
  };
  durationMs: number;
  error: string | null;
  version: ReturnType<typeof getHealthVersionPayload>;
};

const SMOKE_USER_ID = "vision_user_upload_smoke";

export async function runVisionUserUploadSmoke(): Promise<VisionUserUploadSmokeResult> {
  const started = Date.now();
  const version = getHealthVersionPayload();
  const base: VisionUserUploadSmokeResult = {
    ok: false,
    stage: "init",
    environment: version.environment,
    commitSha: version.commitSha,
    attachmentId: null,
    diagnosticId: null,
    detectedType: null,
    summaryPreview: null,
    model: null,
    cached: null,
    storage: {
      byteLength: null,
      mimeType: null,
      detectedMime: null,
      headHex32: null,
      sharpOpenable: null,
      width: null,
      height: null,
    },
    stages: {
      upload: false,
      storageRead: false,
      storageOpenable: false,
      visionAnalyze: false,
    },
    durationMs: 0,
    error: null,
    version,
  };

  if (!isOpenAIConfigured()) {
    return {
      ...base,
      stage: "config",
      error: "OPENAI_API_KEY not configured",
      durationMs: Date.now() - started,
    };
  }

  let attachmentId: string | null = null;
  try {
    // Fresh JPEG each run (avoids fixture packaging / hash-reuse orphans).
    const buffer = await sharp({
      create: {
        width: 96,
        height: 96,
        channels: 3,
        background: { r: 40, g: 120, b: 200 },
      },
    })
      .jpeg({ quality: 90 })
      .toBuffer();

    logVisionPipeline({
      stage: "image_select",
      ok: true,
      fileName: "smoke-generated.jpg",
      mimeType: "image/jpeg",
      byteLength: buffer.length,
      headHex32: buffer.subarray(0, 32).toString("hex"),
    });

    base.stage = "uploadUserImages";
    const { results } = await uploadUserImages({
      userId: SMOKE_USER_ID,
      files: [
        {
          fileName: "smoke-generated.jpg",
          mimeType: "image/jpeg",
          buffer,
        },
      ],
      preferReadableText: true,
      retentionPolicy: "temporary",
    });
    attachmentId = results[0]?.attachment.id ?? null;
    base.attachmentId = attachmentId;
    base.stages.upload = Boolean(attachmentId);
    logVisionPipeline({
      stage: "attachment_upload_after",
      ok: Boolean(attachmentId),
      attachmentId,
      mimeType: results[0]?.attachment.mimeType ?? null,
      byteLength: results[0]?.attachment.processedBytes ?? null,
    });

    if (!attachmentId) {
      return {
        ...base,
        stage: "upload_empty",
        error: "uploadUserImages returned no attachment id",
        durationMs: Date.now() - started,
      };
    }

    base.stage = "storage_read";
    const stored = await readProcessedImageBytes(SMOKE_USER_ID, attachmentId);
    if (!stored) {
      logVisionPipeline({
        stage: "storage_read",
        ok: false,
        attachmentId,
        dropReason: "storage_read_null",
      });
      return {
        ...base,
        stage: "storage_read_null",
        error: "readProcessedImageBytes returned null after upload",
        durationMs: Date.now() - started,
      };
    }

    base.stages.storageRead = true;
    const detectedMime = detectImageMimeFromBytes(stored.buffer);
    let sharpOpenable = false;
    let width: number | null = null;
    let height: number | null = null;
    try {
      const meta = await sharp(stored.buffer, { failOn: "none", pages: 1 }).metadata();
      sharpOpenable = Boolean(meta.width && meta.height && meta.format);
      width = meta.width ?? null;
      height = meta.height ?? null;
    } catch {
      sharpOpenable = false;
    }
    base.storage = {
      byteLength: stored.buffer.length,
      mimeType: stored.mimeType,
      detectedMime,
      headHex32: stored.buffer.subarray(0, 32).toString("hex"),
      sharpOpenable,
      width,
      height,
    };
    base.stages.storageOpenable = sharpOpenable;
    logVisionPipeline({
      stage: "storage_read",
      ok: sharpOpenable,
      attachmentId,
      mimeType: stored.mimeType,
      byteLength: stored.buffer.length,
      headHex32: base.storage.headHex32,
      dropReason: sharpOpenable ? null : "storage_bytes_not_openable",
    });

    if (!sharpOpenable) {
      return {
        ...base,
        stage: "storage_corrupt",
        error: `storage bytes not openable head=${base.storage.headHex32} mime=${detectedMime}`,
        durationMs: Date.now() - started,
      };
    }

    base.stage = "analyzeUserImage";
    const analysis = await analyzeUserImage({
      userId: SMOKE_USER_ID,
      attachmentId,
      userText: "この画像を一言で説明してください。テストです。",
      forceRefresh: true,
      detail: "low",
      ecoMode: true,
      jobId: "job_vision_user_upload_smoke",
    });

    base.stages.visionAnalyze = true;
    base.diagnosticId = analysis.diagnosticId ?? null;
    base.detectedType = analysis.detectedType;
    base.summaryPreview = (analysis.summary ?? "").slice(0, 160);
    base.model = analysis.model ?? null;
    base.cached = analysis.cached === true;
    base.ok = Boolean(analysis.summary?.trim() || analysis.detectedType);
    base.stage = base.ok ? "completed" : "empty_analysis";
    base.error = base.ok ? null : "analysis returned empty summary/type";
    base.durationMs = Date.now() - started;

    logVisionPipeline({
      stage: "return_to_frontend",
      ok: base.ok,
      diagnosticId: base.diagnosticId,
      attachmentId,
      outputTextPreview: base.summaryPreview,
    });

    return base;
  } catch (error) {
    const diagnosticId =
      error &&
      typeof error === "object" &&
      "diagnosticId" in error &&
      typeof (error as { diagnosticId?: unknown }).diagnosticId === "string"
        ? (error as { diagnosticId: string }).diagnosticId
        : null;
    base.diagnosticId = diagnosticId;
    const providerMessage =
      error &&
      typeof error === "object" &&
      "providerMessage" in error &&
      typeof (error as { providerMessage?: unknown }).providerMessage === "string"
        ? (error as { providerMessage: string }).providerMessage
        : null;
    const errStage =
      error &&
      typeof error === "object" &&
      "stage" in error &&
      typeof (error as { stage?: unknown }).stage === "string"
        ? (error as { stage: string }).stage
        : null;
    base.error = [
      error instanceof Error ? error.message.slice(0, 240) : String(error),
      errStage ? `stage=${errStage}` : null,
      providerMessage ? providerMessage.slice(0, 240) : null,
    ]
      .filter(Boolean)
      .join(" | ");
    base.durationMs = Date.now() - started;
    logVisionPipeline({
      stage: "image_dropped",
      ok: false,
      attachmentId,
      dropReason: base.error,
      diagnosticId,
    });
    return base;
  } finally {
    if (attachmentId) {
      try {
        await deleteImageAttachment(SMOKE_USER_ID, attachmentId);
      } catch {
        /* best-effort cleanup */
      }
    }
  }
}
