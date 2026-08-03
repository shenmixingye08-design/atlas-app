import "server-only";

import {
  assertSafeExportText,
  logDeliverableNormalizeDebug,
} from "@/lib/orchestration/normalize-deliverable-payload";
import {
  notifyWorkCompleted,
  notifyWorkFailed,
} from "@/lib/notifications/emitters";
import { persistNotificationsNow } from "@/lib/notifications/durable";
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
import { logWordPipeline } from "./pipeline-log";
import { recordWordMetric } from "./word-metrics";
import { trackWordEvent } from "./word-analytics";
import { estimateAiCost, recordWordCostEvent } from "./word-cost";
import { resolveGenerationFormats } from "./resolve-formats";
import {
  saveDeliverableFileDurableDetailed,
  toDeliverableMetadata,
  updateStoredDeliverableMetadata,
} from "./store";
import type {
  Deliverable,
  DeliverableMetadata,
  GenerateDeliverablesInput,
  GeneratedDeliverableFile,
} from "./types";
import { getWordCompanyBrand } from "./company-brand";
import { detectWordPurpose, isWordTemplateId } from "./word-templates";
import type { DocxGenerateOptions } from "./generators/docx-generator";
import {
  applyMemoryForDeliverable,
  saveDeliverableMemoryHistory,
} from "@/lib/memory-apply/deliverables";
import type { MemoryDeliverableOverlay } from "@/lib/memory-apply/types";
import { recordMemoryApplyEvent } from "@/lib/memory-apply/metrics";
import {
  addDeliverableVersion,
  buildVersionedDisplayName,
  buildVersionedInternalFileName,
  createVersionGroup,
  findVersionGroupByDeliverableId,
  listDeliverableVersions,
  type DeliverableVersionRecord,
} from "./versioning";
import {
  advanceWordJobStage,
  claimWordJob,
  completeWordJob,
  failWordJob,
  failWordJobIfStillRunning,
  failStaleRunningWordJobs,
  getWordJob,
  heartbeatWordJob,
  isWordJobTerminal,
  stageReached,
} from "./word-job-stages";

async function emitWordTerminalNotification(input: {
  userId: string;
  jobId: string;
  suppressed?: boolean;
  kind: "completed" | "failed" | "timeout";
  deliverableId?: string | null;
  fileName?: string | null;
  downloadUrl?: string | null;
  message?: string | null;
}): Promise<void> {
  if (input.suppressed) return;
  const requestId = `wordjob:${input.jobId}:${input.kind}`;
  try {
    if (input.kind === "completed" && input.deliverableId && input.downloadUrl) {
      notifyWorkCompleted(input.userId, {
        title: "Wordファイルの準備ができました",
        message: input.fileName
          ? `「${input.fileName}」を作成しました。通知から開いてダウンロードできます。`
          : "Wordファイルを作成しました。",
        actionUrl: input.downloadUrl,
        relatedTaskId: input.deliverableId,
        deliverableId: input.deliverableId,
        requestId,
      });
    } else {
      notifyWorkFailed(input.userId, {
        title:
          input.kind === "timeout"
            ? "Word作成がタイムアウトしました"
            : "Wordファイルを作成できませんでした",
        message:
          input.message?.trim() ||
          "処理を完了できませんでした。もう一度お試しください。",
        deliverableId: input.deliverableId ?? null,
        requestId,
      });
    }
    await persistNotificationsNow(input.userId);
    logWordPipeline({
      stage: "NOTIFICATION_CREATED",
      jobId: input.jobId,
      userId: input.userId,
      deliverableId: input.deliverableId,
      requestId,
      ok: input.kind === "completed",
      detail: input.kind,
    });
  } catch (error) {
    console.error(
      "[word_pipeline] notification_emit_failed",
      error instanceof Error ? error.message : error,
    );
  }
}

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
  docxOptions?: DocxGenerateOptions,
  memoryOverlay?: MemoryDeliverableOverlay | null,
): Promise<{
  file: GeneratedDeliverableFile | null;
  reasons: string[];
  attempts: number;
  timings: { generateMs: number; verifyMs: number };
}> {
  const generator = getDeliverableGenerator(format);
  if (!generator) {
    return {
      file: null,
      reasons:
        format === "docx"
          ? ["Word生成失敗: generator_missing"]
          : ["generator_missing"],
      attempts: 0,
      timings: { generateMs: 0, verifyMs: 0 },
    };
  }

  const metric = metricKeyForFormat(format);
  let lastReasons: string[] = [];
  let attempts = 0;
  let generateMs = 0;
  let verifyMs = 0;

  const sharedOptions: Record<string, unknown> = {
    ...(docxOptions ?? {}),
    memoryOverlay: memoryOverlay ?? null,
    brandColorHex:
      memoryOverlay?.brandColorHex ?? docxOptions?.brand?.brandColorHex ?? null,
    footerNote:
      memoryOverlay?.footerNote ?? docxOptions?.footerNote ?? null,
    companyName:
      memoryOverlay?.companyName ?? docxOptions?.companyName ?? null,
    excel: memoryOverlay?.excel ?? null,
    powerpoint: memoryOverlay?.powerpoint ?? null,
    pdf: memoryOverlay?.pdf ?? null,
  };

  // Attempt + one automatic regenerate on verify failure (blank PDF forbidden).
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    attempts = attempt;
    try {
      if (format === "docx" && consumeWordFault("docx_packer")) {
        throw new Error("fault_inject:docx_packer");
      }
      const renderStarted = Date.now();
      const file =
        format === "docx"
          ? await generator.generate(content, baseFileName, docxOptions)
          : await generator.generate(content, baseFileName, sharedOptions);
      generateMs += Date.now() - renderStarted;
      if (format === "docx" && consumeWordFault("docx_verify")) {
        lastReasons = ["Word生成失敗: fault_inject:docx_verify"];
        recordReliabilityEvent(metric, "retry");
        recordReliabilityEvent("retry", "retry");
        continue;
      }
      const verifyStarted = Date.now();
      const verified = await verifyGeneratedExportAsync(file);
      verifyMs += Date.now() - verifyStarted;
      if (verified.ok) {
        if (format === "docx") {
          const integrityStarted = Date.now();
          const integrity = buildIntegritySnapshot({
            buffer: file.buffer,
            format: file.format,
            fileName: file.fileName,
          });
          verifyMs += Date.now() - integrityStarted;
          if (!integrity.hasPkHeader || !integrity.ooxmlVerified) {
            lastReasons = [
              `Word生成失敗: ooxml_incomplete:${integrity.ooxmlMissing.join(",")}`,
            ];
            recordReliabilityEvent(metric, "retry");
            continue;
          }
        }
        recordReliabilityEvent(metric, "success");
        return {
          file,
          reasons: [],
          attempts,
          timings: { generateMs, verifyMs },
        };
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
  return {
    file: null,
    reasons: lastReasons,
    attempts,
    timings: { generateMs, verifyMs },
  };
}

export type GenerateDeliverablesOptions = {
  userId: string;
  /** Idempotency / resume key. Same jobId will not double-generate. */
  jobId?: string;
  /**
   * Stable worker id for lease ownership.
   * Resume must pass the same id used for any prior claim to avoid double-claim deadlocks.
   */
  workerId?: string;
  /**
   * When true, skip emitting the Word-ready user notification from the engine.
   * Used when the caller (commander / server-word-export) owns notification timing.
   */
  suppressWordReadyNotification?: boolean;
  /**
   * When true, skip the AI content quality gate.
   * Used for server-side Word export after orchestration already approved the text.
   * Still rejects empty content earlier in generateDeliverables.
   */
  contentAlreadyApproved?: boolean;
  /** Optional AI content regenerator for quality retries. */
  regenerateContent?: (
    strategy: "same_model" | "simplified_prompt" | "fallback_model",
    attempt: number,
  ) => Promise<string>;
  /** Explicit Word template override. */
  templateId?: string | null;
  companyName?: string;
  recipient?: string;
  author?: string;
  createdAt?: string;
  parentDeliverableId?: string | null;
  versionGroupId?: string | null;
  revisionReason?: string | null;
  cost?: {
    model?: string | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    regenerateCount?: number | null;
  };
};

function estimateTokensFromText(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function buildWordMetadata(input: {
  purpose: string | null;
  templateId: string | null;
  versionRecord: DeliverableVersionRecord | null;
  fallbackVersion: number;
  parentDeliverableId?: string | null;
  versionGroupId?: string | null;
}): DeliverableMetadata {
  return {
    purpose: input.purpose,
    templateId: input.templateId,
    version: input.versionRecord?.version ?? input.fallbackVersion,
    parentDeliverableId:
      input.versionRecord?.parentDeliverableId ??
      input.parentDeliverableId ??
      null,
    versionGroupId: input.versionRecord?.groupId ?? input.versionGroupId ?? null,
  };
}

function recordWordCost(input: {
  userId: string;
  content: string;
  assignment: string;
  options: GenerateDeliverablesOptions;
  templateId?: string | null;
  purpose?: string | null;
  success: boolean;
  durationMs: number;
  storageBytes: number;
  retryCount: number;
}): void {
  const inputTokens =
    input.options.cost?.inputTokens ??
    estimateTokensFromText(`${input.assignment}\n${input.content}`);
  const outputTokens =
    input.options.cost?.outputTokens ?? estimateTokensFromText(input.content);
  const estimated = estimateAiCost({
    model: input.options.cost?.model ?? null,
    inputTokens,
    outputTokens,
  });

  recordWordCostEvent({
    userId: input.userId,
    templateId: input.templateId,
    purpose: input.purpose,
    success: input.success,
    breakdown: {
      model: input.options.cost?.model ?? null,
      inputTokens,
      outputTokens,
      aiCost: estimated.cost,
      currency: estimated.currency,
      storageBytes: input.storageBytes,
      downloadBytes: 0,
      retryCount: input.retryCount,
      regenerateCount: input.options.cost?.regenerateCount ?? 0,
      durationMs: input.durationMs,
      costKnown: estimated.costKnown,
    },
  });
}

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

  // Resolve formats before claiming — only Word jobs enter the stage machine.
  let safeContent = exportGuard.text;
  const detection = resolveGenerationFormats(
    input.assignment,
    input.formats,
    safeContent,
  );
  const formats = detection.formats;
  const needsWord = formats.includes("docx");

  await failStaleRunningWordJobs();

  const workerId =
    options.workerId?.trim() ||
    `worker_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

  // Non-docx exports do not create a Word job (avoids permanent `running`).
  if (!needsWord) {
    const deliverables: Deliverable[] = [];
    const failures: Array<{ format: string; reasons: string[] }> = [];
    // Fail Closed: Memory未取得で成果物生成禁止
    const earlyMemory = await applyMemoryForDeliverable({
      userId: options.userId,
      content: safeContent,
      format: formats[0] ?? "pdf",
      assignment: input.assignment,
    });
    const earlyMemoryOverlay: MemoryDeliverableOverlay | null =
      earlyMemory.overlay;
    if (earlyMemory.applied) safeContent = earlyMemory.content;
    for (const format of formats) {
      const channel =
        format === "xlsx"
          ? "excel"
          : format === "pdf"
            ? "pdf"
            : format === "pptx"
              ? "powerpoint"
              : null;
      if (!channel) continue;
      recordMemoryApplyEvent({
        userId: options.userId,
        channel,
        memoryMode: earlyMemory.applied ? "on" : "off",
        applied: earlyMemory.applied,
        memoryIdsUsed: earlyMemory.memoryIdsUsed,
        scopesUsed: earlyMemory.overlay.scopesUsed,
        improvementRate: earlyMemory.quality.improvementRate,
        success: true,
      });
    }
    for (const format of formats) {
      const { file, reasons } = await generateVerifiedFile(
        format,
        safeContent,
        baseFileName,
        undefined,
        earlyMemoryOverlay,
      );
      if (!file) {
        failures.push({ format, reasons });
        continue;
      }
      const { stored } = await saveDeliverableFileDurableDetailed(
        file,
        options.userId,
        { sourceContent: safeContent, baseFileName },
      );
      deliverables.push(toDeliverableMetadata(stored, requestOrigin));
      await saveDeliverableMemoryHistory({
        userId: options.userId,
        format,
        assignment: input.assignment,
        summary: stored.fileName ?? format,
        memoryIdsUsed: earlyMemory.memoryIdsUsed,
      });
    }
    recordWordMetric("total_ms", Date.now() - startedAt);
    return { deliverables, detection, failures, jobId };
  }

  // Claim job lease (prevents duplicate generation for the same jobId).
  const claim = await claimWordJob({
    jobId,
    userId: options.userId,
    assignment: input.assignment,
    sourceContent: exportGuard.text,
    baseFileName,
    format: "docx",
    workerId,
  });

  if (!claim.ok && claim.reason === "already_completed" && claim.job.deliverableId) {
    recordWordMetric("dedupe_hit");
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
      detection,
      failures: [],
      jobId,
    };
  }

  if (!claim.ok && claim.reason === "owned_by_other") {
    recordWordMetric("dedupe_hit");
    return {
      deliverables: [],
      detection,
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

  try {
    // AI content quality gate — only before Word conversion.
    // Skip when caller already approved orchestration text (server Word export).
    if (
      options.contentAlreadyApproved &&
      !stageReached(job?.stage ?? "REQUEST_RECEIVED", "AI_CONTENT_COMPLETED")
    ) {
      await advanceWordJobStage(jobId, "AI_CONTENT_STARTED");
      await advanceWordJobStage(jobId, "AI_CONTENT_COMPLETED", {
        sourceContent: safeContent,
      });
    } else if (!stageReached(job?.stage ?? "REQUEST_RECEIVED", "AI_CONTENT_COMPLETED")) {
      await advanceWordJobStage(jobId, "AI_CONTENT_STARTED");
      await heartbeatWordJob(jobId);
      const modelStarted = Date.now();
      const quality = await generateQualityWordContent({
        initialContent: safeContent,
        regenerate: options.regenerateContent,
      });
      recordWordMetric("model_ms", Date.now() - modelStarted);
      if (!quality.ok) {
        recordWordMetric("ai_content_failure");
        trackWordEvent({
          name: "generate_failure",
          userId: options.userId,
          jobId,
          format: "docx",
          stage: "model",
          success: false,
          durationMs: Date.now() - modelStarted,
        });
        recordWordCost({
          userId: options.userId,
          assignment: input.assignment,
          content: safeContent,
          options,
          success: false,
          durationMs: Date.now() - modelStarted,
          storageBytes: 0,
          retryCount: 0,
        });
        await failWordJob(jobId, "AI_CONTENT_STARTED", quality.message);
        await emitWordTerminalNotification({
          userId: options.userId,
          jobId,
          suppressed: options.suppressWordReadyNotification === true,
          kind: "failed",
          message: quality.message,
        });
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
        trackWordEvent({
          name: "generate_failure",
          userId: options.userId,
          jobId,
          format: "docx",
          stage: "model_validation",
          success: false,
          durationMs: Date.now() - modelStarted,
        });
        recordWordCost({
          userId: options.userId,
          assignment: input.assignment,
          content: safeContent,
          options,
          success: false,
          durationMs: Date.now() - modelStarted,
          storageBytes: 0,
          retryCount: 0,
        });
        await failWordJob(jobId, "AI_CONTENT_STARTED", again.message);
        await emitWordTerminalNotification({
          userId: options.userId,
          jobId,
          suppressed: options.suppressWordReadyNotification === true,
          kind: "failed",
          message: again.message,
        });
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

    const deliverables: Deliverable[] = [];
    const failures: Array<{ format: string; reasons: string[] }> = [];

    // Memory apply before artifact generation — Fail Closed (shared PersonalizationContext).
    const primaryFormat = formats.includes("docx")
      ? "docx"
      : formats[0] ?? "docx";
    const memoryApplied = await applyMemoryForDeliverable({
      userId: options.userId,
      content: safeContent,
      format: primaryFormat,
      assignment: input.assignment,
    });
    const memoryOverlay: MemoryDeliverableOverlay | null =
      memoryApplied.overlay;
    let memoryAppliedContent: string | null = null;
    if (memoryApplied.applied) {
      memoryAppliedContent = memoryApplied.content;
      safeContent = memoryApplied.content;
    }
    for (const format of formats) {
      if (format === "md" || format === "txt") continue;
      const channel =
        format === "docx"
          ? "word"
          : format === "xlsx"
            ? "excel"
            : format === "pdf"
              ? "pdf"
              : format === "pptx"
                ? "powerpoint"
                : null;
      if (!channel) continue;
      recordMemoryApplyEvent({
        userId: options.userId,
        channel,
        memoryMode: memoryApplied.applied ? "on" : "off",
        applied: memoryApplied.applied,
        memoryIdsUsed: memoryApplied.memoryIdsUsed,
        scopesUsed: memoryApplied.overlay.scopesUsed,
        improvementRate: memoryApplied.quality.improvementRate,
        success: true,
      });
    }
    void memoryAppliedContent;

    const brand =
      memoryOverlay?.brand ?? (await getWordCompanyBrand(options.userId));
    const explicitTemplateId =
      options.templateId && isWordTemplateId(options.templateId)
        ? options.templateId
        : null;
    const memoryTemplateId =
      !explicitTemplateId &&
      memoryOverlay?.templateId &&
      isWordTemplateId(memoryOverlay.templateId)
        ? memoryOverlay.templateId
        : null;
    const defaultTemplateId =
      !explicitTemplateId &&
      !memoryTemplateId &&
      brand?.defaultTemplateId &&
      isWordTemplateId(brand.defaultTemplateId)
        ? brand.defaultTemplateId
        : null;
    const purposeStarted = Date.now();
    const purpose = detectWordPurpose({
      assignment: input.assignment,
      title: input.title,
      content: safeContent,
      explicitTemplateId:
        explicitTemplateId ?? memoryTemplateId ?? defaultTemplateId,
    });
    recordWordMetric("purpose_ms", Date.now() - purposeStarted);
    trackWordEvent({
      name: "purpose_detected",
      userId: options.userId,
      jobId,
      templateId: purpose.templateId,
      purpose: purpose.purpose,
      format: "docx",
      stage: purpose.matchedRule,
      success: true,
    });
    trackWordEvent({
      name: "template_selected",
      userId: options.userId,
      jobId,
      templateId: purpose.templateId,
      purpose: purpose.purpose,
      format: "docx",
      stage: explicitTemplateId
        ? "explicit"
        : defaultTemplateId
          ? "brand_default"
          : "auto",
      success: true,
    });
    await advanceWordJobStage(jobId, job?.stage ?? "REQUEST_RECEIVED", {
      sourceContent: safeContent,
    });

    const docxOptions: DocxGenerateOptions = {
      assignment: input.assignment,
      title: input.title,
      templateId: purpose.templateId,
      brand,
      author:
        options.author ??
        memoryOverlay?.author ??
        brand?.contactName,
      companyName:
        options.companyName ??
        memoryOverlay?.companyName ??
        brand?.companyName,
      recipient: options.recipient,
      createdAt: options.createdAt,
      footerNote: memoryOverlay?.footerNote ?? brand?.footerText,
    };

    for (const format of formats) {
      await heartbeatWordJob(jobId);

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
        // Must reach a terminal state — previously left `running`.
        await completeWordJob(jobId, job.deliverableId);
        await emitWordTerminalNotification({
          userId: options.userId,
          jobId,
          suppressed: options.suppressWordReadyNotification === true,
          kind: "completed",
          deliverableId: job.deliverableId,
          fileName: `${job.baseFileName}.docx`,
          downloadUrl: `/api/deliverables/${job.deliverableId}`,
        });
        continue;
      }

      if (format === "docx") {
        await advanceWordJobStage(jobId, "DOCX_GENERATION_STARTED");
      }

      const genStarted = Date.now();
      const { file, reasons, attempts, timings } = await generateVerifiedFile(
        format,
        safeContent,
        baseFileName,
        format === "docx" ? docxOptions : undefined,
        memoryOverlay,
      );

      if (!file) {
        if (format === "docx") {
          recordWordMetric("word_convert_failure");
          recordWordMetric("docx_ms", timings.generateMs);
          recordWordMetric("verify_ms", timings.verifyMs);
          trackWordEvent({
            name: "generate_failure",
            userId: options.userId,
            jobId,
            templateId: purpose.templateId,
            purpose: purpose.purpose,
            format: "docx",
            stage: "docx",
            success: false,
            durationMs: Date.now() - genStarted,
          });
          recordWordCost({
            userId: options.userId,
            assignment: input.assignment,
            content: safeContent,
            options,
            templateId: purpose.templateId,
            purpose: purpose.purpose,
            success: false,
            durationMs: Date.now() - genStarted,
            storageBytes: 0,
            retryCount: Math.max(0, attempts - 1),
          });
          await failWordJob(
            jobId,
            "DOCX_GENERATION_STARTED",
            reasons.join(",") || "word_convert_failed",
          );
          await emitWordTerminalNotification({
            userId: options.userId,
            jobId,
            suppressed: options.suppressWordReadyNotification === true,
            kind: "failed",
            message: reasons.join(",") || "word_convert_failed",
          });
        }
        failures.push({ format, reasons });
        continue;
      }

      if (format === "docx") {
        recordWordMetric("generate_ms", Date.now() - genStarted);
        recordWordMetric("docx_ms", timings.generateMs);
        recordWordMetric("verify_ms", timings.verifyMs);
        await advanceWordJobStage(jobId, "DOCX_GENERATION_COMPLETED");
        await advanceWordJobStage(jobId, "DOCX_VERIFY_COMPLETED");
        await advanceWordJobStage(jobId, "DOCX_STORAGE_STARTED");
      }

      const versionGroupBeforeSave =
        format === "docx" && options.versionGroupId
          ? listDeliverableVersions(options.versionGroupId)
          : [];
      const fallbackVersion =
        format === "docx" && options.versionGroupId
          ? versionGroupBeforeSave.reduce(
              (max, item) => Math.max(max, item.version),
              0,
            ) + 1
          : 1;
      const metadata =
        format === "docx"
          ? buildWordMetadata({
              purpose: purpose.purpose ?? null,
              templateId: purpose.templateId ?? null,
              versionRecord: null,
              fallbackVersion,
              parentDeliverableId: options.parentDeliverableId ?? null,
              versionGroupId: options.versionGroupId ?? null,
            })
          : null;

      const persistStarted = Date.now();
      const { stored, persist } = await saveDeliverableFileDurableDetailed(
        file,
        options.userId,
        {
          sourceContent: safeContent,
          baseFileName,
          deliverableId: job?.deliverableId ?? undefined,
          metadata,
        },
      );

      if (format === "docx") {
        recordWordMetric("persist_ms", Date.now() - persistStarted);
        recordWordMetric("save_ms", Date.now() - persistStarted);
        if (!persist.durable) {
          recordWordMetric("storage_failure");
          trackWordEvent({
            name: "persist_failure",
            userId: options.userId,
            jobId,
            deliverableId: stored.id,
            templateId: purpose.templateId,
            purpose: purpose.purpose,
            format: "docx",
            stage: "save",
            success: false,
            durationMs: Date.now() - persistStarted,
            sizeBytes: stored.buffer.byteLength,
          });
          recordWordCost({
            userId: options.userId,
            assignment: input.assignment,
            content: safeContent,
            options,
            templateId: purpose.templateId,
            purpose: purpose.purpose,
            success: false,
            durationMs: Date.now() - genStarted,
            storageBytes: stored.buffer.byteLength,
            retryCount: Math.max(0, attempts - 1),
          });
          await failWordJob(
            jobId,
            "DOCX_STORAGE_STARTED",
            persist.storageError ?? "storage_failed",
          );
          await emitWordTerminalNotification({
            userId: options.userId,
            jobId,
            suppressed: options.suppressWordReadyNotification === true,
            kind: "failed",
            deliverableId: stored.id,
            message:
              persist.storageError ??
              "Wordファイルは完成しましたが、保存できませんでした。",
          });
          failures.push({
            format,
            reasons: [
              `storage_failed:${persist.storageError ?? "unknown"}`,
              "Wordファイルは完成しましたが、保存できませんでした。",
            ],
          });
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
        const notifyStarted = Date.now();
        const meta = toDeliverableMetadata(stored, requestOrigin);
        // Real user notification (was previously a no-op stage label only).
        await emitWordTerminalNotification({
          userId: options.userId,
          jobId,
          suppressed: options.suppressWordReadyNotification === true,
          kind: "completed",
          deliverableId: stored.id,
          fileName: stored.fileName,
          downloadUrl: meta.downloadUrl,
        });
        await advanceWordJobStage(jobId, "NOTIFICATION_SENT", {
          deliverableId: stored.id,
          notificationStatus: "sent",
        });
        recordWordMetric("notify_ms", Date.now() - notifyStarted);
        await completeWordJob(jobId, stored.id);

        let versionRecord: DeliverableVersionRecord | null = null;
        if (options.versionGroupId && options.parentDeliverableId) {
          versionRecord = addDeliverableVersion({
            groupId: options.versionGroupId,
            newDeliverableId: stored.id,
            parentDeliverableId: options.parentDeliverableId,
            createdBy: options.userId,
            displayName: buildVersionedDisplayName(
              baseFileName,
              fallbackVersion,
            ),
            internalFileName: buildVersionedInternalFileName(
              stored.fileName,
              fallbackVersion,
            ),
            revisionReason: options.revisionReason ?? null,
            jobId,
            diffSummary: "regenerated",
          });
        } else if (!findVersionGroupByDeliverableId(stored.id)) {
          versionRecord = createVersionGroup({
            deliverableId: stored.id,
            createdBy: options.userId,
            displayName: baseFileName,
            internalFileName: stored.fileName,
            jobId,
          });
        } else {
          versionRecord =
            findVersionGroupByDeliverableId(stored.id)?.record ?? null;
        }
        stored.metadata = buildWordMetadata({
          purpose: purpose.purpose ?? null,
          templateId: purpose.templateId ?? null,
          versionRecord,
          fallbackVersion,
          parentDeliverableId: options.parentDeliverableId ?? null,
          versionGroupId: options.versionGroupId ?? null,
        });
        await updateStoredDeliverableMetadata(
          stored.id,
          options.userId,
          stored.metadata,
        );
        trackWordEvent({
          name: "persist_success",
          userId: options.userId,
          jobId,
          deliverableId: stored.id,
          templateId: purpose.templateId,
          purpose: purpose.purpose,
          format: "docx",
          stage: "save",
          success: true,
          durationMs: Date.now() - persistStarted,
          sizeBytes: stored.buffer.byteLength,
        });
        trackWordEvent({
          name: "generate_success",
          userId: options.userId,
          jobId,
          deliverableId: stored.id,
          templateId: purpose.templateId,
          purpose: purpose.purpose,
          format: "docx",
          stage: "completed",
          success: true,
          durationMs: Date.now() - genStarted,
          sizeBytes: stored.buffer.byteLength,
        });
        recordWordCost({
          userId: options.userId,
          assignment: input.assignment,
          content: safeContent,
          options,
          templateId: purpose.templateId,
          purpose: purpose.purpose,
          success: true,
          durationMs: Date.now() - genStarted,
          storageBytes: stored.buffer.byteLength,
          retryCount: Math.max(0, attempts - 1),
        });
        recordWordMetric("success");
      }

      deliverables.push(toDeliverableMetadata(stored, requestOrigin));
      await saveDeliverableMemoryHistory({
        userId: options.userId,
        format,
        assignment: input.assignment,
        summary: stored.fileName ?? format,
        memoryIdsUsed: memoryApplied.memoryIdsUsed,
      });
    }

    // Safety net: every claimed Word job must leave as completed|failed.
    const settled = await getWordJob(jobId);
    if (settled && !isWordJobTerminal(settled.status)) {
      const docx = deliverables.find((d) => d.format === "docx");
      if (docx) {
        await completeWordJob(jobId, docx.id);
        await emitWordTerminalNotification({
          userId: options.userId,
          jobId,
          suppressed: options.suppressWordReadyNotification === true,
          kind: "completed",
          deliverableId: docx.id,
          fileName: docx.fileName,
          downloadUrl: docx.downloadUrl,
        });
      } else {
        const reason =
          failures.map((f) => f.reasons.join(",")).join(";") ||
          "docx_not_produced";
        await failWordJob(jobId, settled.stage, reason);
        await emitWordTerminalNotification({
          userId: options.userId,
          jobId,
          suppressed: options.suppressWordReadyNotification === true,
          kind: "failed",
          message: reason,
        });
      }
    }

    recordWordMetric("total_ms", Date.now() - startedAt);

    return {
      deliverables,
      detection,
      failures,
      jobId,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "generate_deliverables_aborted";
    await failWordJobIfStillRunning(
      jobId,
      job?.stage ?? "REQUEST_RECEIVED",
      message,
    );
    throw error;
  } finally {
    await failWordJobIfStillRunning(
      jobId,
      job?.stage ?? "REQUEST_RECEIVED",
      "unterminated_job:処理が完了ステータスに到達しませんでした",
    );
  }
}

