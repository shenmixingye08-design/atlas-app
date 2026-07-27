import "server-only";

import {
  assertSafeExportText,
  logDeliverableNormalizeDebug,
} from "@/lib/orchestration/normalize-deliverable-payload";
import { recordReliabilityEvent } from "@/lib/reliability";

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
import { buildDeliverableBaseName } from "./filename";
import { getDeliverableGenerator } from "./generators";
import { resolveGenerationFormats } from "./resolve-formats";
import { saveDeliverableFileDurable, toDeliverableMetadata } from "./store";
import type {
  Deliverable,
  GenerateDeliverablesInput,
  GeneratedDeliverableFile,
} from "./types";

export type GenerateDeliverablesResult = {
  deliverables: Deliverable[];
  detection: ReturnType<typeof detectDeliverableFormats>;
  failures: Array<{ format: string; reasons: string[] }>;
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
      }
      const verified = await verifyGeneratedExportAsync(file);
      if (format === "docx") {
        logDocxStage("DOCX_VERIFY_COMPLETED", stageContext, {
          attempt,
          ok: verified.ok,
          reasons: verified.reasons,
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

/**
 * Deliverables Engine — runs after orchestration completes.
 * Success for exports requires verifyGeneratedExportAsync; otherwise regenerate once.
 * Files are durably persisted (disk + optional Supabase) before metadata is returned.
 * Generation success + store failure is reported as「Word生成成功・保存失敗」.
 */
export async function generateDeliverables(
  input: GenerateDeliverablesInput,
  requestOrigin: string,
  options: { userId: string; jobId?: string | null; workflowId?: string | null },
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

  const deliverables: Deliverable[] = [];
  const failures: Array<{ format: string; reasons: string[] }> = [];

  for (const format of formats) {
    const { file, reasons } = await generateVerifiedFile(
      format,
      safeContent,
      baseFileName,
      stageContext,
    );
    if (!file) {
      failures.push({ format, reasons });
      continue;
    }

    try {
      if (format === "docx") {
        logDocxStage("DOCX_STORE_STARTED", stageContext, {
          sizeBytes: file.buffer.byteLength,
          fileName: file.fileName,
        });
      }
      const stored = await saveDeliverableFileDurable(file, options.userId, {
        sourceContent: content,
        baseFileName,
      });
      if (format === "docx") {
        logDocxStage("DOCX_STORE_COMPLETED", stageContext, {
          deliverableId: stored.id,
          sizeBytes: stored.buffer.byteLength,
        });
      }
      const meta = toDeliverableMetadata(stored, requestOrigin);
      if (format === "docx") {
        logDocxStage("DOCX_METADATA_CREATED", stageContext, {
          deliverableId: meta.id,
          downloadUrl: meta.downloadUrl,
        });
        logDocxStage("DOCX_DOWNLOAD_READY", stageContext, {
          deliverableId: meta.id,
          downloadUrl: meta.downloadUrl,
        });
      }
      deliverables.push(meta);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error ?? "unknown");
      if (format === "docx") {
        logDocxStageFailure("DOCX_STORE_STARTED", error, stageContext, {
          fileName: file.fileName,
        });
        failures.push({
          format,
          reasons: [`Word生成成功・保存失敗: ${message}`],
        });
      } else {
        failures.push({
          format,
          reasons: [`生成成功・保存失敗: ${message}`],
        });
      }
    }
  }

  return {
    deliverables,
    detection,
    failures,
  };
}
