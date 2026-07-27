import "server-only";

import {
  assertSafeExportText,
  logDeliverableNormalizeDebug,
} from "@/lib/orchestration/normalize-deliverable-payload";
import { recordReliabilityEvent } from "@/lib/reliability";

import { assertWordDeliverableComplete } from "./completion";
import { detectDeliverableFormats } from "./detect-formats";
import {
  logDocxStage,
  logDocxStageFailure,
  type DocxStageContext,
} from "./docx-stage-log";
import {
  metricKeyForFormat,
  verifyGeneratedExportAsync,
} from "./export-verify";
import { classifyDeliverableFailureReason } from "./failure-messages";
import { buildDeliverableBaseName } from "./filename";
import { getDeliverableGenerator } from "./generators";
import {
  buildGenerationIdempotencyKey,
  getIdempotentGeneration,
  markGenerationCompleted,
  markGenerationFailed,
  markGenerationRunning,
  withGenerationLock,
} from "./idempotency";
import { resolveGenerationFormats } from "./resolve-formats";
import { saveDeliverableFileDurable, toDeliverableMetadata } from "./store";
import type {
  Deliverable,
  GenerateDeliverablesInput,
  GeneratedDeliverableFile,
} from "./types";
import {
  logWorkPipeline,
  logWorkPipelineFailure,
} from "./work-pipeline-log";

export type GenerateDeliverablesResult = {
  deliverables: Deliverable[];
  detection: ReturnType<typeof detectDeliverableFormats>;
  failures: Array<{ format: string; reasons: string[] }>;
};

export type GenerateDeliverablesOptions = {
  userId: string;
  jobId?: string | null;
  workflowId?: string | null;
  generationAttempt?: number;
};

async function generateVerifiedFile(
  format: GeneratedDeliverableFile["format"],
  content: string,
  baseFileName: string,
  stageContext: DocxStageContext,
): Promise<{ file: GeneratedDeliverableFile | null; reasons: string[] }> {
  const generator = getDeliverableGenerator(format);
  if (!generator) {
    return {
      file: null,
      reasons:
        format === "docx"
          ? ["Word生成失敗: generator_missing"]
          : ["generator_missing"],
    };
  }

  const metric = metricKeyForFormat(format);
  let lastReasons: string[] = [];

  // Attempt + one automatic regenerate on verify failure (blank PDF forbidden).
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const file = await generator.generate(content, baseFileName);
      if (format === "docx") {
        logDocxStage("DOCX_VERIFY_STARTED", stageContext, {
          attempt,
          sizeBytes: file.buffer.byteLength,
        });
        logWorkPipeline("DOCX_VERIFY_STARTED", stageContext, {
          attempt,
          sizeBytes: file.buffer.byteLength,
        });
      }
      const verified = await verifyGeneratedExportAsync(file);
      if (format === "docx") {
        logDocxStage("DOCX_VERIFY_COMPLETED", stageContext, {
          attempt,
          ok: verified.ok,
          reasons: verified.reasons,
        });
        logWorkPipeline("DOCX_VERIFY_COMPLETED", stageContext, {
          attempt,
          ok: verified.ok,
        });
      }
      if (verified.ok) {
        recordReliabilityEvent(metric, "success");
        return { file, reasons: [] };
      }
      lastReasons = verified.reasons;
      recordReliabilityEvent(metric, "retry");
      recordReliabilityEvent("retry", "retry");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error ?? "unknown");
      lastReasons = [
        format === "docx" ? `Word生成失敗: ${message}` : message,
      ];
      if (format === "docx") {
        logDocxStageFailure("DOCX_VERIFY_STARTED", error, stageContext, {
          attempt,
        });
        logWorkPipelineFailure("DOCX_VERIFY_STARTED", error, {
          ...stageContext,
          format,
          attempt,
        });
      }
      recordReliabilityEvent(metric, "retry");
      recordReliabilityEvent("retry", "retry");
    }
  }

  recordReliabilityEvent(metric, "failure");
  if (format === "docx" && !lastReasons.some((r) => r.includes("Word生成失敗"))) {
    lastReasons = [`Word生成失敗: ${lastReasons.join(",") || "verify_failed"}`];
  }
  return { file: null, reasons: lastReasons };
}

async function generateOneFormat(input: {
  format: GeneratedDeliverableFile["format"];
  content: string;
  originalContent: string;
  baseFileName: string;
  requestOrigin: string;
  options: GenerateDeliverablesOptions;
  stageContext: DocxStageContext;
}): Promise<{ deliverable: Deliverable | null; reasons: string[] }> {
  const { format, options } = input;
  const jobId = options.jobId?.trim() || null;

  if (jobId) {
    const key = buildGenerationIdempotencyKey({
      jobId,
      userId: options.userId,
      format,
      generationAttempt: options.generationAttempt ?? 1,
    });

    return withGenerationLock(key, async () => {
      const existing = getIdempotentGeneration(key);
      if (existing?.status === "completed" && existing.deliverable) {
        return { deliverable: existing.deliverable, reasons: [] };
      }
      // Only failed records may regenerate; running waits via lock.
      markGenerationRunning(key);

      const produced = await produceAndStoreFormat(input);
      if (produced.deliverable) {
        markGenerationCompleted(key, produced.deliverable);
      } else {
        markGenerationFailed(key, produced.reasons);
      }
      return produced;
    });
  }

  return produceAndStoreFormat(input);
}

async function produceAndStoreFormat(input: {
  format: GeneratedDeliverableFile["format"];
  content: string;
  originalContent: string;
  baseFileName: string;
  requestOrigin: string;
  options: GenerateDeliverablesOptions;
  stageContext: DocxStageContext;
}): Promise<{ deliverable: Deliverable | null; reasons: string[] }> {
  const { format, stageContext, options } = input;
  const { file, reasons } = await generateVerifiedFile(
    format,
    input.content,
    input.baseFileName,
    stageContext,
  );
  if (!file) {
    return { deliverable: null, reasons };
  }

  try {
    if (format === "docx") {
      logDocxStage("DOCX_STORE_STARTED", stageContext, {
        sizeBytes: file.buffer.byteLength,
        fileName: file.fileName,
      });
      logWorkPipeline("DOCX_STORE_STARTED", {
        ...stageContext,
        format,
        generatedFileSize: file.buffer.byteLength,
      });
    }
    const stored = await saveDeliverableFileDurable(file, options.userId, {
      sourceContent: input.originalContent,
      baseFileName: input.baseFileName,
    });
    if (format === "docx") {
      logDocxStage("DOCX_STORE_COMPLETED", stageContext, {
        deliverableId: stored.id,
        sizeBytes: stored.buffer.byteLength,
      });
      logWorkPipeline("DOCX_STORE_COMPLETED", {
        ...stageContext,
        format,
        deliverableId: stored.id,
        generatedFileSize: stored.buffer.byteLength,
      });
    }
    const meta = toDeliverableMetadata(stored, input.requestOrigin);
    if (format === "docx") {
      const completion = assertWordDeliverableComplete({
        format: stored.format,
        buffer: stored.buffer,
        mimeType: stored.mimeType,
        fileName: stored.fileName,
        verified: true,
        saved: true,
        deliverableId: meta.id,
        downloadUrl: meta.downloadUrl,
        ownerUserId: stored.userId,
        expectedUserId: options.userId,
        listed: true,
      });
      if (!completion.ok) {
        const message = `Word生成成功・保存失敗: incomplete:${completion.reasons.join(",")}`;
        logWorkPipelineFailure(
          "DOCX_METADATA_CREATED",
          new Error(message),
          {
            ...stageContext,
            format,
            deliverableId: meta.id,
            generatedFileSize: stored.buffer.byteLength,
          },
        );
        return { deliverable: null, reasons: [message] };
      }
      logDocxStage("DOCX_METADATA_CREATED", stageContext, {
        deliverableId: meta.id,
        downloadUrl: meta.downloadUrl,
      });
      logDocxStage("DOCX_DOWNLOAD_READY", stageContext, {
        deliverableId: meta.id,
        downloadUrl: meta.downloadUrl,
      });
      logWorkPipeline("DOCX_METADATA_CREATED", {
        ...stageContext,
        format,
        deliverableId: meta.id,
        generatedFileSize: stored.buffer.byteLength,
      });
      logWorkPipeline("DOCX_DOWNLOAD_READY", {
        ...stageContext,
        format,
        deliverableId: meta.id,
        generatedFileSize: stored.buffer.byteLength,
      });
    }
    return { deliverable: meta, reasons: [] };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error ?? "unknown");
    if (format === "docx") {
      logDocxStageFailure("DOCX_STORE_STARTED", error, stageContext, {
        fileName: file.fileName,
      });
      logWorkPipelineFailure("DOCX_STORE_STARTED", error, {
        ...stageContext,
        format,
        generatedFileSize: file.buffer.byteLength,
      });
      return {
        deliverable: null,
        reasons: [`Word生成成功・保存失敗: ${message}`],
      };
    }
    return {
      deliverable: null,
      reasons: [`生成成功・保存失敗: ${message}`],
    };
  }
}

/**
 * Deliverables Engine — runs after orchestration completes.
 * Success for exports requires verifyGeneratedExportAsync; otherwise regenerate once.
 * Files are durably persisted (disk + optional Supabase) before metadata is returned.
 * Generation success + store failure is reported as「Word生成成功・保存失敗」.
 * When jobId is provided, successful docx is idempotent per job/format/attempt.
 */
export async function generateDeliverables(
  input: GenerateDeliverablesInput,
  requestOrigin: string,
  options: GenerateDeliverablesOptions,
): Promise<GenerateDeliverablesResult> {
  const content = input.finalDeliverable.trim();
  const stageContext: DocxStageContext = {
    userId: options.userId,
    jobId: options.jobId ?? null,
    workflowId: options.workflowId ?? null,
  };

  if (!content) {
    return {
      deliverables: [],
      detection: detectDeliverableFormats(input.assignment),
      failures: [{ format: "*", reasons: ["empty_deliverable"] }],
    };
  }

  const exportGuard = assertSafeExportText(content);
  if (!exportGuard.ok) {
    logDeliverableNormalizeDebug({
      stage: "generateDeliverables",
      parseSucceeded: false,
      validationSucceeded: false,
      rejectedReason: exportGuard.rejectedReason,
    });
    return {
      deliverables: [],
      detection: detectDeliverableFormats(input.assignment),
      failures: [{ format: "*", reasons: [exportGuard.rejectedReason] }],
    };
  }

  if (!options.userId.trim()) {
    throw new Error("userId is required to generate deliverables");
  }

  const safeContent = exportGuard.text;
  const detection = resolveGenerationFormats(
    input.assignment,
    input.formats,
    safeContent,
  );
  const formats = detection.formats;
  const baseFileName = buildDeliverableBaseName(
    input.assignment,
    input.title,
  );

  logWorkPipeline(
    "FORMAT_DETECTED",
    {
      ...stageContext,
      format: formats.join(","),
    },
    { matchedRule: detection.matchedRule },
  );

  const deliverables: Deliverable[] = [];
  const failures: Array<{ format: string; reasons: string[] }> = [];

  for (const format of formats) {
    const produced = await generateOneFormat({
      format,
      content: safeContent,
      originalContent: content,
      baseFileName,
      requestOrigin,
      options,
      stageContext,
    });
    if (produced.deliverable) {
      deliverables.push(produced.deliverable);
    } else {
      const reasons = produced.reasons.map((reason) => {
        if (format !== "docx") return reason;
        // Keep store/generate labels intact for classifiers.
        if (
          reason.includes("Word生成成功・保存失敗") ||
          reason.startsWith("Word生成失敗")
        ) {
          return reason;
        }
        const classified = classifyDeliverableFailureReason(reason);
        return classified.stage === "store"
          ? reason
          : reason.startsWith("Word")
            ? reason
            : `Word生成失敗: ${reason}`;
      });
      failures.push({ format, reasons });
    }
  }

  return {
    deliverables,
    detection,
    failures,
  };
}
