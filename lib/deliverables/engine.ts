import "server-only";

import { recordReliabilityEvent } from "@/lib/reliability";

import { detectDeliverableFormats } from "./detect-formats";
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
      const verified = await verifyGeneratedExportAsync(file);
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
 * Files are durably persisted (Supabase + disk) before metadata is returned.
 */
export async function generateDeliverables(
  input: GenerateDeliverablesInput,
  requestOrigin: string,
  options: { userId: string },
): Promise<GenerateDeliverablesResult> {
  const content = input.finalDeliverable.trim();

  if (!content) {
    return {
      deliverables: [],
      detection: detectDeliverableFormats(input.assignment),
      failures: [{ format: "*", reasons: ["empty_deliverable"] }],
    };
  }

  if (!options.userId.trim()) {
    throw new Error("userId is required to generate deliverables");
  }

  const detection = resolveGenerationFormats(
    input.assignment,
    input.formats,
    content,
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
      content,
      baseFileName,
    );
    if (!file) {
      failures.push({ format, reasons });
      continue;
    }
    const stored = await saveDeliverableFileDurable(file, options.userId, {
      sourceContent: content,
      baseFileName,
    });
    deliverables.push(toDeliverableMetadata(stored, requestOrigin));
  }

  return {
    deliverables,
    detection,
    failures,
  };
}
