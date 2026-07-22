import "server-only";

import {
  recommendOutputFormat,
  resolveFormatsFromRecommendation,
} from "@/lib/documents/classify/recommend-format";
import { normalizeToDocumentModel } from "@/lib/documents/normalize";
import {
  DocumentRenderError,
  renderDocumentModelToFile,
} from "@/lib/documents/render/render-from-model";
import {
  getDocumentModel,
  saveDeliverableArtifact,
  saveDocumentModel,
} from "@/lib/documents/storage/document-store";
import type { OutputFormat, TemplateId } from "@/lib/documents/schema/enums";
import { detectDeliverableFormats } from "./detect-formats";
import { buildDeliverableBaseName } from "./filename";
import { getDeliverableGenerator } from "./generators";
import { documentModelToExportText } from "@/lib/documents/render/bridge";
import { saveDeliverableFile, toDeliverableMetadata } from "./store";
import type {
  Deliverable,
  DeliverableFormat,
  GenerateDeliverablesInput,
} from "./types";

export type GenerateDeliverablesResult = {
  deliverables: Deliverable[];
  detection: ReturnType<typeof detectDeliverableFormats>;
  documentModelId: string | null;
  formatRecommendation: ReturnType<typeof recommendOutputFormat> | null;
};

const IR_FORMATS = new Set<DeliverableFormat>(["pdf", "docx", "xlsx"]);

function toOutputFormat(format: DeliverableFormat): OutputFormat | null {
  if (format === "pdf" || format === "docx" || format === "xlsx") return format;
  return null;
}

/**
 * Deliverables Engine — Phase 2: normalize once → IR → N formats (zero extra AI).
 */
export async function generateDeliverables(
  input: GenerateDeliverablesInput,
  requestOrigin: string,
): Promise<GenerateDeliverablesResult> {
  const content = input.finalDeliverable.trim();
  const keywordDetection = detectDeliverableFormats(input.assignment);

  if (!content) {
    return {
      deliverables: [],
      detection: keywordDetection,
      documentModelId: null,
      formatRecommendation: null,
    };
  }

  let storedModel = input.documentModelId
    ? getDocumentModel(input.documentModelId)
    : null;

  if (!storedModel) {
    const model = normalizeToDocumentModel(content, {
      title: input.title,
      templateId: input.templateId,
    });
    storedModel = saveDocumentModel({
      model,
      userId: input.userId ?? null,
      jobId: input.jobId ?? null,
    });
  }

  const model = storedModel.model;
  const formatRecommendation = recommendOutputFormat(model);
  const irFormats = resolveFormatsFromRecommendation(
    formatRecommendation,
    input.formats
      ?.filter((f): f is OutputFormat => toOutputFormat(f) !== null)
      .map((f) => f as OutputFormat),
  );

  const legacyFormats =
    input.formats?.filter((f) => !IR_FORMATS.has(f)) ??
    keywordDetection.formats.filter((f) => !IR_FORMATS.has(f));

  const formatsToGenerate = [
    ...new Set([
      ...irFormats,
      ...legacyFormats.filter((f) => toOutputFormat(f) === null),
    ]),
  ] as DeliverableFormat[];

  const baseFileName = buildDeliverableBaseName(input.assignment, model.title);
  const templateId = (input.templateId ?? model.templateId) as TemplateId;
  const deliverables: Deliverable[] = [];
  const exportText = documentModelToExportText(model);

  for (const format of formatsToGenerate) {
    const outputFormat = toOutputFormat(format);

    if (outputFormat) {
      try {
        const { file, validation } = await renderDocumentModelToFile(
          model,
          outputFormat,
          baseFileName,
          templateId,
        );
        file.documentModelId = storedModel.id;
        file.templateId = templateId;
        file.validationPassed = validation.valid;

        const artifact = saveDeliverableArtifact({
          documentModelId: storedModel.id,
          userId: input.userId ?? null,
          jobId: input.jobId ?? null,
          format: outputFormat,
          templateId,
          fileName: file.fileName,
          mimeType: file.mimeType,
          buffer: file.buffer,
          validation,
        });

        const stored = saveDeliverableFile({
          ...file,
          id: artifact.id,
          userId: input.userId ?? null,
        });
        deliverables.push(toDeliverableMetadata(stored, requestOrigin));
      } catch (error) {
        if (error instanceof DocumentRenderError) {
          console.error(
            `[generateDeliverables] ${format} validation failed:`,
            error.validationError ?? error.message,
          );
          continue;
        }
        throw error;
      }
      continue;
    }

    const generator = getDeliverableGenerator(format);
    if (!generator) continue;

    const file = await generator.generate(exportText, baseFileName);
    file.documentModelId = storedModel.id;
    file.templateId = templateId;
    const stored = saveDeliverableFile({ ...file, userId: input.userId ?? null });
    deliverables.push(toDeliverableMetadata(stored, requestOrigin));
  }

  return {
    deliverables,
    detection: {
      formats: formatsToGenerate,
      matchedRule: input.formats?.length
        ? "user_selected_formats"
        : keywordDetection.matchedRule,
    },
    documentModelId: storedModel.id,
    formatRecommendation,
  };
}

/** Re-render from stored IR — no AI, no re-normalize. */
export async function rerenderDeliverables(
  documentModelId: string,
  options: {
    formats: OutputFormat[];
    templateId?: TemplateId;
    baseFileName: string;
    requestOrigin: string;
    userId?: string | null;
    jobId?: string | null;
  },
): Promise<Deliverable[]> {
  const stored = getDocumentModel(documentModelId);
  if (!stored) {
    throw new Error("Document model not found");
  }

  const model = stored.model;
  const templateId = options.templateId ?? model.templateId;
  const deliverables: Deliverable[] = [];

  for (const format of options.formats) {
    const { file, validation } = await renderDocumentModelToFile(
      { ...model, templateId },
      format,
      options.baseFileName,
      templateId,
    );
    file.documentModelId = documentModelId;
    file.templateId = templateId;

    const artifact = saveDeliverableArtifact({
      documentModelId,
      userId: options.userId ?? null,
      jobId: options.jobId ?? null,
      format,
      templateId,
      fileName: file.fileName,
      mimeType: file.mimeType,
      buffer: file.buffer,
      validation,
    });

    const storedFile = saveDeliverableFile({
      ...file,
      id: artifact.id,
      userId: options.userId ?? null,
    });
    deliverables.push(toDeliverableMetadata(storedFile, options.requestOrigin));
  }

  return deliverables;
}
