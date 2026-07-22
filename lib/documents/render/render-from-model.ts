import "server-only";

import { documentModelToParsedDeliverable } from "@/lib/documents/render/bridge";
import { renderDocumentModelToXlsx } from "@/lib/documents/render/xlsx/xlsx-renderer";
import type { DocumentModel } from "@/lib/documents/schema/document-model.zod";
import type { OutputFormat, TemplateId } from "@/lib/documents/schema/enums";
import { validateDeliverableBuffer } from "@/lib/documents/validate";
import { buildDocxBufferFromParsed } from "@/lib/deliverables/generators/docx-generator";
import { buildPdfBufferFromParsed } from "@/lib/deliverables/generators/pdf-generator";
import { buildFileName } from "@/lib/deliverables/filename";
import {
  DELIVERABLE_EXTENSIONS,
  DELIVERABLE_MIME_TYPES,
  type GeneratedDeliverableFile,
} from "@/lib/deliverables/types";

export type RenderFromModelResult = {
  file: GeneratedDeliverableFile;
  validation: Awaited<ReturnType<typeof validateDeliverableBuffer>>;
};

export class DocumentRenderError extends Error {
  constructor(
    message: string,
    readonly format: OutputFormat,
    readonly validationError?: string,
  ) {
    super(message);
    this.name = "DocumentRenderError";
  }
}

/** Render DocumentModel to binary — no AI calls. */
export async function renderDocumentModelToFile(
  model: DocumentModel,
  format: OutputFormat,
  baseFileName: string,
  _templateId: TemplateId,
): Promise<RenderFromModelResult> {
  const parsed = documentModelToParsedDeliverable(model);
  let buffer: Buffer;

  switch (format) {
    case "docx":
      buffer = await buildDocxBufferFromParsed(parsed);
      break;
    case "pdf":
      buffer = await buildPdfBufferFromParsed(parsed, model.title);
      break;
    case "xlsx":
      buffer = await renderDocumentModelToXlsx(model);
      break;
    default:
      throw new DocumentRenderError(`Unsupported format: ${format}`, format);
  }

  const validation = await validateDeliverableBuffer(format, buffer);
  if (!validation.valid) {
    throw new DocumentRenderError(
      validation.error ?? "File validation failed",
      format,
      validation.error,
    );
  }

  const deliverableFormat = format === "xlsx" ? "xlsx" : format;
  const file: GeneratedDeliverableFile = {
    format: deliverableFormat as GeneratedDeliverableFile["format"],
    fileName: buildFileName(baseFileName, DELIVERABLE_EXTENSIONS[deliverableFormat]),
    mimeType: DELIVERABLE_MIME_TYPES[deliverableFormat],
    buffer,
    isPlaceholder: false,
    documentModelId: undefined,
    templateId: _templateId,
    validationPassed: true,
    pageCount: validation.pageCount ?? null,
    sheetCount: validation.sheetCount ?? null,
  };

  return { file, validation };
}
