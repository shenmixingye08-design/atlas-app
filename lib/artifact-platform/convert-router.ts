import "server-only";

import { getStoredDeliverableForUser } from "@/lib/deliverables/store";
import { loadDurableDeliverable } from "@/lib/deliverables/durable-store";
import { updateDurableDeliverableMetadata } from "@/lib/deliverables/durable-store";

import { runConversionEngine, isExtensionOnlyFakeConversion } from "./convert-engines";
import { ArtifactPlatformError } from "./errors";
import {
  getConversionMeta,
  normalizeArtifactFormat,
  qualityLabel,
} from "./formats";
import {
  buildConversionFingerprint,
  idempotencyLookup,
  idempotencyStore,
} from "./idempotency";
import { getUnifiedArtifact, registerArtifact } from "./register";
import type {
  ArtifactJobPhase,
  ConvertArtifactInput,
  ConvertArtifactResult,
  UnifiedArtifact,
} from "./types";

const MAX_SOURCE_BYTES = 80 * 1024 * 1024;
const CONVERT_TIMEOUT_MS = 90_000;

type JobState = {
  jobId: string;
  phase: ArtifactJobPhase;
  progress: number;
  sourceArtifactId: string;
  targetFormat: string;
  artifactId: string | null;
  retryCount: number;
  startedAt: string;
  completedAt: string | null;
  failedStage: string | null;
  diagnosticId: string;
};

function jobBucket(): Map<string, JobState> {
  const scope = globalThis as typeof globalThis & {
    __atlasArtifactJobs?: Map<string, JobState>;
  };
  if (!scope.__atlasArtifactJobs) scope.__atlasArtifactJobs = new Map();
  return scope.__atlasArtifactJobs;
}

export function getArtifactJob(jobId: string): JobState | null {
  return jobBucket().get(jobId) ?? null;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new ArtifactPlatformError("timeout", `conversion exceeded ${ms}ms`)
      );
    }, ms);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}

async function appendConversionHistory(
  source: UnifiedArtifact,
  target: UnifiedArtifact,
  quality: string
) {
  const row = await loadDurableDeliverable(source.id, source.userId);
  if (!row) return;
  const meta = { ...(row.metadata ?? {}) } as Record<string, unknown>;
  const history = Array.isArray(meta.conversionHistory)
    ? [...meta.conversionHistory]
    : [];
  history.push({
    targetArtifactId: target.id,
    targetFormat: target.format,
    quality,
    at: new Date().toISOString(),
  });
  meta.conversionHistory = history;
  await updateDurableDeliverableMetadata({
    id: source.id,
    userId: source.userId,
    metadata: meta as never,
  });
}

/**
 * Central conversion router — all format conversions should go through here.
 */
export async function convertArtifact(
  input: ConvertArtifactInput
): Promise<ConvertArtifactResult> {
  const diagnosticId = `art_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const jobId = input.options?.jobId ?? `aj_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const idemKey =
    input.options?.idempotencyKey ??
    buildConversionFingerprint({
      sourceArtifactId: input.sourceArtifactId,
      targetFormat: String(input.targetFormat),
      revisionReason: input.options?.revisionReason,
    });

  const cached = idempotencyLookup(input.userId, idemKey);
  if (cached?.ok) {
    return cached;
  }

  const targetFormat = normalizeArtifactFormat(String(input.targetFormat));
  if (!targetFormat) {
    return {
      ok: false,
      artifact: null,
      quality: "unsupported",
      warnings: [],
      errors: [
        {
          code: "invalid_target_format",
          message: "変換先の形式が正しくありません。",
          stage: "validating_input",
          retriable: false,
          diagnosticId,
        },
      ],
    };
  }

  const job: JobState = {
    jobId,
    phase: "queued",
    progress: 0,
    sourceArtifactId: input.sourceArtifactId,
    targetFormat,
    artifactId: null,
    retryCount: 0,
    startedAt: new Date().toISOString(),
    completedAt: null,
    failedStage: null,
    diagnosticId,
  };
  jobBucket().set(jobId, job);

  try {
    job.phase = "validating_input";
    job.progress = 10;

    const source = await getUnifiedArtifact(input.sourceArtifactId, input.userId);
    if (!source) {
      throw new ArtifactPlatformError(
        "source_artifact_not_found",
        `artifact ${input.sourceArtifactId}`,
        { diagnosticId }
      );
    }
    if (source.userId !== input.userId) {
      throw new ArtifactPlatformError("permission_denied", "owner mismatch", {
        diagnosticId,
      });
    }

    const meta = getConversionMeta(source.format, targetFormat);
    if (meta.quality === "unsupported") {
      throw new ArtifactPlatformError(
        "unsupported_conversion",
        `${source.format}->${targetFormat}`,
        { diagnosticId, qualityLabel: qualityLabel("unsupported") }
      );
    }

    const stored = await getStoredDeliverableForUser(source.id, input.userId);
    if (!stored || !stored.buffer?.byteLength) {
      throw new ArtifactPlatformError(
        "source_file_missing",
        "binary missing",
        { diagnosticId, sourceArtifactId: source.id }
      );
    }
    if (stored.buffer.byteLength > MAX_SOURCE_BYTES) {
      throw new ArtifactPlatformError("file_too_large", "source too large", {
        diagnosticId,
        fileSize: stored.buffer.byteLength,
      });
    }

    const sameFormatRevision = source.format === targetFormat;
    job.phase = sameFormatRevision ? "generating" : "converting";
    job.progress = 40;

    let outBuffer: Buffer;
    let quality: Exclude<typeof meta.quality, "unsupported"> = meta.quality;
    let warnings: string[] = [qualityLabel(meta.quality)];
    let sourceContent = stored.sourceContent ?? "";

    if (sameFormatRevision) {
      // Explicit revision of same format — caller should pass new buffer via options;
      // without new bytes this is not a fake conversion — reject.
      throw new ArtifactPlatformError(
        "invalid_target_format",
        "same-format convert requires revision API with new bytes",
        { diagnosticId }
      );
    } else {
      const engineOut = await withTimeout(
        runConversionEngine({
          sourceFormat: source.format,
          targetFormat,
          buffer: stored.buffer,
          title: input.options?.title ?? source.title,
          sourceContent: stored.sourceContent,
          fileName: source.fileName,
        }),
        CONVERT_TIMEOUT_MS
      );
      outBuffer = engineOut.buffer;
      quality = engineOut.quality;
      warnings = [...warnings, ...engineOut.warnings];
      sourceContent = engineOut.sourceContent || sourceContent;

      if (
        isExtensionOnlyFakeConversion(
          stored.buffer,
          outBuffer,
          source.format,
          targetFormat
        )
      ) {
        throw new ArtifactPlatformError(
          "conversion_failed",
          "refusing extension-only fake conversion",
          { diagnosticId }
        );
      }
    }

    job.phase = "validating_output";
    job.progress = 70;

    job.phase = "uploading";
    job.progress = 85;

    const artifact = await registerArtifact({
      userId: input.userId,
      buffer: outBuffer,
      format: targetFormat,
      title: input.options?.title ?? `${source.title} (${targetFormat})`,
      description: `Converted from ${source.format}`,
      sourceContent,
      sourceArtifactId: source.id,
      rootArtifactId: source.rootArtifactId || source.id,
      conversionType: "format_conversion",
      createdFrom: `convert:${meta.engine}`,
      changeReason: input.options?.revisionReason ?? `convert_to_${targetFormat}`,
      changeSummary: warnings.slice(0, 3).join(" / "),
      requestId: input.options?.requestId,
      jobId,
      quality,
      asRevision: false,
    });

    job.phase = "saving_artifact";
    await appendConversionHistory(source, artifact, quality);

    job.phase = "completed";
    job.progress = 100;
    job.artifactId = artifact.id;
    job.completedAt = new Date().toISOString();
    jobBucket().set(jobId, job);

    const result: ConvertArtifactResult = {
      ok: true,
      artifact,
      quality,
      warnings,
      errors: [],
      reused: false,
    };
    idempotencyStore(input.userId, idemKey, result);
    return result;
  } catch (error) {
    const code =
      error instanceof ArtifactPlatformError
        ? error.code
        : "conversion_failed";
    const message =
      error instanceof ArtifactPlatformError
        ? error.userMessage
        : "形式変換に失敗しました。";
    job.phase = "failed";
    job.failedStage = job.phase === "failed" ? "converting" : job.phase;
    jobBucket().set(jobId, job);

    const result: ConvertArtifactResult = {
      ok: false,
      artifact: null,
      quality: "unsupported",
      warnings: [],
      errors: [
        {
          code,
          message,
          stage: String(job.failedStage ?? "converting"),
          retriable: code === "timeout" || code === "conversion_failed",
          diagnosticId,
        },
      ],
    };
    // Cache failures briefly only for duplicate_request semantics when completed? skip
    if (code === "duplicate_request") {
      idempotencyStore(input.userId, idemKey, result);
    }
    return result;
  }
}

export async function createArtifactRevision(input: {
  sourceArtifactId: string;
  userId: string;
  buffer: Buffer;
  changeReason?: string;
  changeSummary?: string;
  jobId?: string | null;
  idempotencyKey?: string | null;
}): Promise<ConvertArtifactResult> {
  const diagnosticId = `rev_${Date.now().toString(36)}`;
  const idemKey =
    input.idempotencyKey ??
    buildConversionFingerprint({
      sourceArtifactId: input.sourceArtifactId,
      targetFormat: "revision",
      revisionReason: input.changeReason,
    });
  const cached = idempotencyLookup(input.userId, idemKey);
  if (cached?.ok) return cached;

  try {
    const source = await getUnifiedArtifact(input.sourceArtifactId, input.userId);
    if (!source) {
      throw new ArtifactPlatformError(
        "source_artifact_not_found",
        input.sourceArtifactId,
        { diagnosticId }
      );
    }
    if (source.userId !== input.userId) {
      throw new ArtifactPlatformError("permission_denied", "owner mismatch");
    }

    const artifact = await registerArtifact({
      userId: input.userId,
      buffer: input.buffer,
      format: source.format,
      title: source.title,
      sourceArtifactId: source.id,
      rootArtifactId: source.rootArtifactId || source.id,
      conversionType: "revision",
      createdFrom: "revision",
      changeReason: input.changeReason ?? "edit",
      changeSummary: input.changeSummary ?? null,
      jobId: input.jobId,
      asRevision: true,
    });

    const result: ConvertArtifactResult = {
      ok: true,
      artifact,
      quality: "high",
      warnings: [],
      errors: [],
    };
    idempotencyStore(input.userId, idemKey, result);
    return result;
  } catch (error) {
    const code =
      error instanceof ArtifactPlatformError ? error.code : "revision_save_failed";
    return {
      ok: false,
      artifact: null,
      quality: "unsupported",
      warnings: [],
      errors: [
        {
          code,
          message:
            error instanceof ArtifactPlatformError
              ? error.userMessage
              : "版の保存に失敗しました。",
          stage: "revision_save",
          retriable: true,
          diagnosticId,
        },
      ],
    };
  }
}
