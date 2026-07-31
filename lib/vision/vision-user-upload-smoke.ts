import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import sharp from "sharp";

import { uploadUserImages } from "@/lib/attachments";
import { deleteImageAttachment } from "@/lib/attachments/store";
import { getHealthVersionPayload } from "@/lib/health/version-info";
import { isOpenAIConfigured } from "@/lib/openai";
import { analyzeUserImage } from "@/lib/vision/analyze-image";
import { logVisionPipeline } from "@/lib/vision/pipeline-log";

/**
 * Production smoke for the REAL user-upload path:
 * buffer → uploadUserImages (preprocess + storage) → analyzeUserImage
 * → Files API / Responses (same as authenticated user attachments).
 *
 * Known-good JPEG fixture is used as the "user" upload bytes so we isolate
 * pipeline drops without depending on browser/Clerk.
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
  stages: {
    upload: boolean;
    storageReadViaAnalyze: boolean;
    visionAnalyze: boolean;
  };
  durationMs: number;
  error: string | null;
  version: ReturnType<typeof getHealthVersionPayload>;
};

const SMOKE_USER_ID = "vision_user_upload_smoke";

async function loadJpeg(): Promise<Buffer> {
  try {
    return readFileSync(join(process.cwd(), "testdata/vision/known-good-64.jpg"));
  } catch {
    return sharp({
      create: {
        width: 96,
        height: 96,
        channels: 3,
        background: { r: 40, g: 120, b: 200 },
      },
    })
      .jpeg({ quality: 90 })
      .toBuffer();
  }
}

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
    stages: {
      upload: false,
      storageReadViaAnalyze: false,
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
    const buffer = await loadJpeg();
    logVisionPipeline({
      stage: "image_select",
      ok: true,
      fileName: "known-good-64.jpg",
      mimeType: "image/jpeg",
      byteLength: buffer.length,
      headHex32: buffer.subarray(0, 32).toString("hex"),
      dropReason: null,
    });

    base.stage = "uploadUserImages";
    const { results } = await uploadUserImages({
      userId: SMOKE_USER_ID,
      files: [
        {
          fileName: "known-good-64.jpg",
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

    base.stages.storageReadViaAnalyze = true;
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
    base.error =
      error instanceof Error ? error.message.slice(0, 400) : String(error);
    base.durationMs = Date.now() - started;
    logVisionPipeline({
      stage: "image_dropped",
      ok: false,
      attachmentId,
      dropReason: base.error,
      diagnosticId: base.diagnosticId,
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
