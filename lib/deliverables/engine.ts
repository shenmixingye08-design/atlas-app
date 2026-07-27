import "server-only";

import {
  assertSafeExportText,
  logDeliverableNormalizeDebug,
} from "@/lib/orchestration/normalize-deliverable-payload";
import { recordReliabilityEvent } from "@/lib/reliability";

import {
  generateQualityWordContent,
  validateWordSourceContent,
} from "./content-quality";
import { detectDeliverableFormats } from "./detect-formats";
import {
  metricKeyForFormat,
  verifyGeneratedExportAsync,
} from "./export-verify";
import { consumeWordFault } from "./fault-inject";
import { buildDeliverableBaseName } from "./filename";
import { getDeliverableGenerator } from "./generators";
import { buildIntegritySnapshot } from "./integrity";
import { recordWordMetric } from "./word-metrics";
import { resolveGenerationFormats } from "./resolve-formats";
import {
  saveDeliverableFileDurableDetailed,
  toDeliverableMetadata,
} from "./store";
import type {
  Deliverable,
  GenerateDeliverablesInput,
  GeneratedDeliverableFile,
} from "./types";
import {
  advanceWordJobStage,
  claimWordJob,
  completeWordJob,
  failWordJob,
  stageReached,
} from "./word-job-stages";

export type GenerateDeliverablesResult = {
  deliverables: Deliverable[];
  detection: ReturnType<typeof detectDeliverableFormats>;
  failures: Array<{ format: string; reasons: string[] }>;
  jobId?: string;
};

async function generateVerifiedFile(
  format: GeneratedDeliverableFile["format"],
  content: string,
  baseFileName: string,
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
      if (format === "docx" && consumeWordFault("docx_packer")) {
        throw new Error("fault_inject:docx_packer");
      }
      const file = await generator.generate(content, baseFileName);
      if (format === "docx" && consumeWordFault("docx_verify")) {
        lastReasons = ["Word生成失敗: fault_inject:docx_verify"];
        recordReliabilityEvent(metric, "retry");
        recordReliabilityEvent("retry", "retry");
        continue;
      }
      const verified = await verifyGeneratedExportAsync(file);
      if (verified.ok) {
        if (format === "docx") {
          const integrity = buildIntegritySnapshot({
            buffer: file.buffer,
            format: file.format,
            fileName: file.fileName,
          });
          if (!integrity.hasPkHeader || !integrity.ooxmlVerified) {
            lastReasons = [
              `Word生成失敗: ooxml_incomplete:${integrity.ooxmlMissing.join(",")}`,
            ];
            recordReliabilityEvent(metric, "retry");
            continue;
          }
        }
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

export type GenerateDeliverablesOptions = {
  userId: string;
  /** Idempotency / resume key. Same jobId will not double-generate. */
  jobId?: string;
  /** Optional AI content regenerator for quality retries. */
  regenerateContent?: (
    strategy: "same_model" | "simplified_prompt" | "fallback_model",
    attempt: number,
  ) => Promise<string>;
};

/**
 * Deliverables Engine — runs after orchestration completes.
 * Success for exports requires verifyGeneratedExportAsync; otherwise regenerate once.
 * Files are durably persisted (Supabase Storage + metadata) before metadata is returned.
 */
export async function generateDeliverables(
  input: GenerateDeliverablesInput,
  requestOrigin: string,
  options: GenerateDeliverablesOptions,
): Promise<GenerateDeliverablesResult> {
  const startedAt = Date.now();
  const content = input.finalDeliverable.trim();
  const jobId =
    options.jobId?.trim() ||
    `dlvjob_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;

  if (!content) {
    recordWordMetric("ai_content_failure");
    return {
      deliverables: [],
      detection: detectDeliverableFormats(input.assignment),
      failures: [{ format: "*", reasons: ["empty_deliverable"] }],
      jobId,
    };
  }

  if (consumeWordFault("ai_content_empty")) {
    recordWordMetric("ai_content_failure");
    return {
      deliverables: [],
      detection: detectDeliverableFormats(input.assignment),
      failures: [
        {
          format: "*",
          reasons: [
            "content_quality:empty",
            "Word変換の前に、文書内容の作成で問題が発生しました。入力内容は保存されています。再実行してください。",
          ],
        },
      ],
      jobId,
    };
  }

  if (consumeWordFault("ai_content_timeout")) {
    recordWordMetric("ai_content_failure");
    return {
      deliverables: [],
      detection: detectDeliverableFormats(input.assignment),
      failures: [
        {
          format: "*",
          reasons: ["ai_content_timeout", "文書内容を作成できませんでした。"],
        },
      ],
      jobId,
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
    recordWordMetric("ai_content_failure");
    return {
      deliverables: [],
      detection: detectDeliverableFormats(input.assignment),
      failures: [{ format: "*", reasons: [exportGuard.rejectedReason] }],
      jobId,
    };
  }

  if (!options.userId.trim()) {
    throw new Error("userId is required to generate deliverables");
  }

  const baseFileName = buildDeliverableBaseName(
    input.assignment,
    input.title,
  );

  // Claim job lease (prevents duplicate generation for the same jobId).
  const claim = await claimWordJob({
    jobId,
    userId: options.userId,
    assignment: input.assignment,
    sourceContent: exportGuard.text,
    baseFileName,
    format: "docx",
  });

  if (!claim.ok && claim.reason === "already_completed" && claim.job.deliverableId) {
    recordWordMetric("dedupe_hit");
    // Return empty failures — caller should reload deliverable by id.
    return {
      deliverables: [
        {
          id: claim.job.deliverableId,
          fileName: `${claim.job.baseFileName}.docx`,
          format: "docx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          generatedAt: claim.job.updatedAt,
          sizeBytes: 0,
          isPlaceholder: false,
          downloadUrl: `/api/deliverables/${claim.job.deliverableId}`,
        },
      ],
      detection: detectDeliverableFormats(input.assignment),
      failures: [],
      jobId,
    };
  }

  if (!claim.ok && claim.reason === "owned_by_other") {
    recordWordMetric("dedupe_hit");
    return {
      deliverables: [],
      detection: detectDeliverableFormats(input.assignment),
      failures: [
        {
          format: "*",
          reasons: ["job_in_progress", "同じ依頼は現在処理中です。"],
        },
      ],
      jobId,
    };
  }

  const job = claim.ok ? claim.job : null;

  let safeContent = exportGuard.text;
  const detection = resolveGenerationFormats(
    input.assignment,
    input.formats,
    safeContent,
  );
  const formats = detection.formats;
  const needsWord = formats.includes("docx");

  // AI content quality gate — only before Word conversion.
  if (needsWord) {
    if (!stageReached(job?.stage ?? "REQUEST_RECEIVED", "AI_CONTENT_COMPLETED")) {
      await advanceWordJobStage(jobId, "AI_CONTENT_STARTED");
      const quality = await generateQualityWordContent({
        initialContent: safeContent,
        regenerate: options.regenerateContent,
      });
      if (!quality.ok) {
        recordWordMetric("ai_content_failure");
        await failWordJob(jobId, "AI_CONTENT_STARTED", quality.message);
        return {
          deliverables: [],
          detection,
          failures: [
            {
              format: "docx",
              reasons: [
                `content_quality:${quality.issues.join(",")}`,
                quality.message,
              ],
            },
          ],
          jobId,
        };
      }
      safeContent = quality.text;
      const again = validateWordSourceContent(safeContent);
      if (!again.ok) {
        recordWordMetric("ai_content_failure");
        await failWordJob(jobId, "AI_CONTENT_STARTED", again.message);
        return {
          deliverables: [],
          detection,
          failures: [
            {
              format: "docx",
              reasons: [
                `content_quality:${again.issues.join(",")}`,
                again.message,
              ],
            },
          ],
          jobId,
        };
      }
      await advanceWordJobStage(jobId, "AI_CONTENT_COMPLETED", {
        sourceContent: safeContent,
      });
    } else if (job?.sourceContent) {
      safeContent = job.sourceContent;
    }
  }

  const deliverables: Deliverable[] = [];
  const failures: Array<{ format: string; reasons: string[] }> = [];

  for (const format of formats) {
    // Resume: skip generation if already stored for this job.
    if (
      format === "docx" &&
      job?.deliverableId &&
      stageReached(job.stage, "DOWNLOAD_READY")
    ) {
      deliverables.push({
        id: job.deliverableId,
        fileName: `${job.baseFileName}.docx`,
        format: "docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        generatedAt: job.updatedAt,
        sizeBytes: 0,
        isPlaceholder: false,
        downloadUrl: `/api/deliverables/${job.deliverableId}`,
      });
      continue;
    }

    if (format === "docx") {
      await advanceWordJobStage(jobId, "DOCX_GENERATION_STARTED");
    }

    const genStarted = Date.now();
    const { file, reasons } = await generateVerifiedFile(
      format,
      safeContent,
      baseFileName,
    );

    if (!file) {
      if (format === "docx") {
        recordWordMetric("word_convert_failure");
        await failWordJob(
          jobId,
          "DOCX_GENERATION_STARTED",
          reasons.join(",") || "word_convert_failed",
        );
      }
      failures.push({ format, reasons });
      continue;
    }

    if (format === "docx") {
      recordWordMetric("generate_ms", Date.now() - genStarted);
      await advanceWordJobStage(jobId, "DOCX_GENERATION_COMPLETED");
      await advanceWordJobStage(jobId, "DOCX_VERIFY_COMPLETED");
      await advanceWordJobStage(jobId, "DOCX_STORAGE_STARTED");
    }

    const persistStarted = Date.now();
    const { stored, persist } = await saveDeliverableFileDurableDetailed(
      file,
      options.userId,
      {
        sourceContent: safeContent,
        baseFileName,
        deliverableId: job?.deliverableId ?? undefined,
      },
    );

    if (format === "docx") {
      recordWordMetric("persist_ms", Date.now() - persistStarted);
      if (!persist.durable) {
        recordWordMetric("storage_failure");
        await failWordJob(
          jobId,
          "DOCX_STORAGE_STARTED",
          persist.storageError ?? "storage_failed",
        );
        failures.push({
          format,
          reasons: [
            `storage_failed:${persist.storageError ?? "unknown"}`,
            "Wordファイルは完成しましたが、保存できませんでした。",
          ],
        });
        // Keep generated binary in memory for resume_from_last_stage, but do not
        // mark the job completed.
        continue;
      }
      await advanceWordJobStage(jobId, "DOCX_STORAGE_COMPLETED", {
        deliverableId: stored.id,
      });
      await advanceWordJobStage(jobId, "METADATA_CREATED", {
        deliverableId: stored.id,
      });
      await advanceWordJobStage(jobId, "DOWNLOAD_READY", {
        deliverableId: stored.id,
      });
      await completeWordJob(jobId, stored.id);
      recordWordMetric("success");
    }

    deliverables.push(toDeliverableMetadata(stored, requestOrigin));
  }

  recordWordMetric("total_ms", Date.now() - startedAt);

  return {
    deliverables,
    detection,
    failures,
    jobId,
  };
}
