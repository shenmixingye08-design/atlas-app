import { resolveDocumentModel } from "../document-model/normalize-document-model";
import type { DeliverableGenerator, GeneratedDeliverableFile } from "../types";
import type { WordCompanyBrand } from "../company-brand";
import type { WordTemplateId } from "../word-templates";

import { renderDocumentModelToDocx } from "./docx-renderer";
import { createDeliverableFile } from "./shared";

export type DocxGenerateOptions = {
  assignment?: string;
  title?: string;
  templateId?: WordTemplateId | null;
  brand?: WordCompanyBrand | null;
  author?: string;
  companyName?: string;
  recipient?: string;
  createdAt?: string;
  footerNote?: string;
  structured?: unknown;
};

/**
 * Production Word (.docx) generator.
 * Shared renderer + template config — no per-template Packer duplication.
 */
export class DocxDeliverableGenerator implements DeliverableGenerator {
  readonly format = "docx" as const;

  async generate(
    content: string,
    baseFileName: string,
    options?: DocxGenerateOptions,
  ): Promise<GeneratedDeliverableFile> {
    const resolved = resolveDocumentModel({
      content,
      assignment: options?.assignment,
      title: options?.title,
      templateId: options?.templateId,
      author: options?.author ?? options?.brand?.contactName,
      companyName: options?.companyName ?? options?.brand?.companyName,
      recipient: options?.recipient,
      createdAt: options?.createdAt,
      footerNote: options?.footerNote ?? options?.brand?.footerText,
      structured: options?.structured,
    });

    const buffer = await renderDocumentModelToDocx({
      model: resolved.model,
      templateId: resolved.model.templateId,
      brand: options?.brand ?? null,
    });

    // Refuse mid-pipeline / text / XML dumps — completed OOXML zip only.
    if (
      buffer.byteLength < 1_500 ||
      buffer[0] !== 0x50 ||
      buffer[1] !== 0x4b
    ) {
      throw new Error("Word生成失敗: Packer output is not a completed .docx zip");
    }
    const head = buffer.subarray(0, 64).toString("utf8");
    if (
      head.includes('"type":') ||
      head.includes("<!DOCTYPE") ||
      head.trimStart().startsWith("{")
    ) {
      throw new Error("Word生成失敗: refused JSON/HTML payload");
    }

    const { assertDocxProductionOrThrow } = await import(
      "../word-production/docx-quality"
    );
    assertDocxProductionOrThrow(buffer);

    return createDeliverableFile("docx", baseFileName, buffer, false);
  }
}

/** @deprecated Use {@link DocxDeliverableGenerator}. */
export const DocxPlaceholderGenerator = DocxDeliverableGenerator;
