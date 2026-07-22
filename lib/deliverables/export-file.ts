import "server-only";

import { DocxDeliverableGenerator } from "./generators/docx-generator";
import { PdfDeliverableGenerator } from "./generators/pdf-generator";
import { buildDeliverableBaseName } from "./filename";
import type { DeliverableFormat, GeneratedDeliverableFile } from "./types";

export type ExportableOfficeFormat = "docx" | "pdf";

export function isExportableOfficeFormat(
  format: string,
): format is ExportableOfficeFormat {
  return format === "docx" || format === "pdf";
}

/**
 * Generate a real Word/PDF binary from existing deliverable text.
 * No LLM calls — deterministic conversion only.
 */
export async function exportOfficeDeliverable(input: {
  format: ExportableOfficeFormat;
  content: string;
  assignment?: string;
  title?: string;
}): Promise<GeneratedDeliverableFile> {
  const content = input.content.trim();
  if (!content) {
    throw new Error("成果物本文が空のため、ファイルを生成できません。");
  }

  const baseFileName = buildDeliverableBaseName(
    input.assignment?.trim() || input.title?.trim() || "minervot-deliverable",
    input.title,
  );

  if (input.format === "docx") {
    return new DocxDeliverableGenerator().generate(content, baseFileName);
  }

  return new PdfDeliverableGenerator().generate(content, baseFileName);
}

export function assertNonEmptyFile(
  file: GeneratedDeliverableFile,
  format: DeliverableFormat,
): void {
  if (!file.buffer || file.buffer.byteLength < 64) {
    throw new Error(
      `${format.toUpperCase()} ファイルが空、または不正なサイズです（${file.buffer?.byteLength ?? 0} bytes）。`,
    );
  }

  if (format === "pdf") {
    const magic = file.buffer.subarray(0, 4).toString("utf-8");
    if (magic !== "%PDF") {
      throw new Error("PDFマジックヘッダが見つかりません。生成結果が不正です。");
    }
  }

  if (format === "docx") {
    // OOXML zip signature PK
    if (file.buffer[0] !== 0x50 || file.buffer[1] !== 0x4b) {
      throw new Error("DOCX (OOXML) シグネチャが見つかりません。生成結果が不正です。");
    }
  }
}
