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
import { getVisionDiagnosticForUser } from "@/lib/vision/diagnostics";
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
    completed: boolean;
  };
  /** Per-stage report for Production forensic (same shape as user request). */
  trace: {
    ok: boolean;
    stage: string;
    attachmentId: string | null;
    diagnosticId: string | null;
    storageDownloadSuccess: boolean | null;
    downloadedByteLength: number | null;
    mimeType: string | null;
    imageByteLength: number | null;
    openaiHttpStatus: number | null;
    openaiRequestId: string | null;
    safeMessage: string | null;
    rawErrorBody: string | null;
    durationMs: number;
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
      completed: false,
    },
    trace: {
      ok: false,
      stage: "init",
      attachmentId: null,
      diagnosticId: null,
      storageDownloadSuccess: null,
      downloadedByteLength: null,
      mimeType: null,
      imageByteLength: null,
      openaiHttpStatus: null,
      openaiRequestId: null,
      safeMessage: null,
      rawErrorBody: null,
      durationMs: 0,
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
    // Receipt-like JPEG (text overlay) — closer to real user uploads than a flat square.
    const buffer = await sharp({
      create: {
        width: 640,
        height: 480,
        channels: 3,
        background: { r: 250, g: 248, b: 240 },
      },
    })
      .composite([
        {
          input: Buffer.from(
            `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
              <rect x="40" y="40" width="560" height="400" fill="#fff" stroke="#222" stroke-width="2"/>
              <text x="320" y="100" text-anchor="middle" font-size="28" font-family="sans-serif" fill="#111">MINERVOT Café</text>
              <text x="80" y="160" font-size="20" font-family="sans-serif" fill="#333">コーヒー</text>
              <text x="480" y="160" text-anchor="end" font-size="20" font-family="sans-serif" fill="#333">¥450</text>
              <text x="80" y="200" font-size="20" font-family="sans-serif" fill="#333">トースト</text>
              <text x="480" y="200" text-anchor="end" font-size="20" font-family="sans-serif" fill="#333">¥380</text>
              <text x="80" y="280" font-size="22" font-family="sans-serif" fill="#111">合計</text>
              <text x="480" y="280" text-anchor="end" font-size="22" font-family="sans-serif" fill="#111">¥830</text>
              <text x="320" y="360" text-anchor="middle" font-size="16" font-family="sans-serif" fill="#666">領収書 / 2026-07-31</text>
            </svg>`,
          ),
          top: 0,
          left: 0,
        },
      ])
      .jpeg({ quality: 90 })
      .toBuffer();

    logVisionPipeline({
      stage: "image_select",
      ok: true,
      fileName: "receipt-smoke.jpg",
      mimeType: "image/jpeg",
      byteLength: buffer.length,
      headHex32: buffer.subarray(0, 32).toString("hex"),
    });

    base.stage = "uploadUserImages";
    const { results } = await uploadUserImages({
      userId: SMOKE_USER_ID,
      files: [
        {
          fileName: "receipt-smoke.jpg",
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
    base.trace.attachmentId = attachmentId;
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
    base.trace.storageDownloadSuccess = sharpOpenable;
    base.trace.downloadedByteLength = stored.buffer.length;
    base.trace.mimeType = stored.mimeType;
    base.trace.imageByteLength = stored.buffer.length;
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
      base.trace.stage = "storage_corrupt";
      base.trace.durationMs = Date.now() - started;
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
      userText:
        "この領収書の内容を読み取り、店名と合計金額を日本語で要約してください。",
      forceRefresh: true,
      detail: "high",
      ecoMode: false,
      jobId: "job_vision_user_upload_smoke",
    });

    base.stages.visionAnalyze = true;
    base.diagnosticId = analysis.diagnosticId ?? null;
    base.detectedType = analysis.detectedType;
    base.summaryPreview = (analysis.summary ?? "").slice(0, 160);
    base.model = analysis.model ?? null;
    base.cached = analysis.cached === true;
    base.ok = Boolean(analysis.summary?.trim() || analysis.detectedType);
    base.stages.completed = base.ok;
    base.stage = base.ok ? "completed" : "empty_analysis";
    base.error = base.ok ? null : "analysis returned empty summary/type";
    base.durationMs = Date.now() - started;

    const diagnostic =
      base.diagnosticId
        ? getVisionDiagnosticForUser(SMOKE_USER_ID, base.diagnosticId)
        : null;
    base.trace = {
      ok: base.ok,
      stage: base.stage,
      attachmentId,
      diagnosticId: base.diagnosticId,
      storageDownloadSuccess: true,
      downloadedByteLength:
        diagnostic?.downloadedByteLength ?? stored.buffer.length,
      mimeType: diagnostic?.mimeType ?? stored.mimeType,
      imageByteLength:
        diagnostic?.imageByteLength ?? stored.buffer.length,
      openaiHttpStatus: diagnostic?.openaiHttpStatus ?? (base.ok ? 200 : null),
      openaiRequestId: diagnostic?.openaiRequestId ?? null,
      safeMessage: diagnostic?.openaiErrorMessage ?? null,
      rawErrorBody: diagnostic?.openaiErrorBody ?? null,
      durationMs: base.durationMs,
    };

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
