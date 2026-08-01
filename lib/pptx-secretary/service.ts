import "server-only";

import { writePptxBuffer, toPreviewPayload } from "./build-pptx";
import { detectPptxIntent } from "./detect-intent";
import { applyPptxEdits } from "./edit";
import {
  presentationFromAssignment,
  presentationFromDocx,
  presentationFromMarkdown,
  presentationFromPdf,
  presentationFromXlsx,
} from "./from-sources";
import { classifyPptxScale, pptxScaleGuidance, PPTX_LIMITS } from "./limits";
import { validatePresentationModel } from "./schema";
import { looksLikePptxZip, sanitizePptxFileName } from "./security";
import type {
  BrandConfig,
  PresentationModel,
  PptxEditOperation,
  PptxSecretaryResult,
} from "./types";

function fail(
  stage: string,
  code: string,
  message: string,
  retriable = true,
): PptxSecretaryResult {
  return {
    ok: false,
    presentation: null,
    buffer: null,
    fileName: "error.pptx",
    slideCount: 0,
    errors: [
      {
        stage,
        code,
        message,
        retriable,
        diagnosticId: `pptx_${Date.now().toString(36)}`,
      },
    ],
    warnings: [],
    preview: null,
  };
}

async function finalize(
  presentation: PresentationModel,
  warnings: string[] = [],
  revisionNote?: string,
): Promise<PptxSecretaryResult> {
  const validation = validatePresentationModel(presentation);
  if (!validation.ok) {
    return fail(
      "validating_output",
      "ai_schema_failed",
      validation.errors.slice(0, 5).join(" / "),
      true,
    );
  }

  const model: PresentationModel = {
    ...validation.value,
    warnings: [...validation.warnings, ...warnings],
  };

  try {
    const buffer = await writePptxBuffer(model);
    if (!looksLikePptxZip(buffer)) {
      return fail("pptx_build", "pptx_generation_failed", "生成ファイルがpptx形式ではありません", false);
    }
    if (buffer.byteLength > PPTX_LIMITS.maxOutputBytes) {
      return fail("pptx_build", "file_too_large", "出力ファイルが大きすぎます", false);
    }

    const preview = toPreviewPayload(model);
    const tier = classifyPptxScale(model.slides.length, buffer.byteLength);
    preview.scaleGuidance = pptxScaleGuidance(tier);

    return {
      ok: true,
      presentation: model,
      buffer,
      fileName: `${sanitizePptxFileName(model.presentation_title)}.pptx`,
      slideCount: model.slides.length,
      errors: [],
      warnings: model.warnings,
      preview,
      revisionNote,
    };
  } catch (error) {
    return fail(
      "pptx_build",
      "pptx_generation_failed",
      error instanceof Error ? error.message : "pptx_generation_failed",
    );
  }
}

export async function createPptxFromAssignment(input: {
  assignment: string;
  contentMarkdown?: string | null;
  brand?: BrandConfig;
}): Promise<PptxSecretaryResult> {
  try {
    const intent = detectPptxIntent(input.assignment);
    if (intent.confidence < 0.4) {
      return fail(
        "intent",
        "input_validation_failed",
        "資料の目的が特定できませんでした。営業 / 研修 / 月次報告など用途を一言添えてください。",
        false,
      );
    }

    let model = input.contentMarkdown?.trim()
      ? await presentationFromMarkdown({
          markdown: input.contentMarkdown,
          assignment: input.assignment,
          brand: input.brand,
        })
      : presentationFromAssignment(input.assignment, input.brand);

    return finalize(model);
  } catch (error) {
    return fail(
      "content",
      "content_generation_failed",
      error instanceof Error ? error.message : "content_generation_failed",
    );
  }
}

export async function createPptxFromUpload(input: {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  assignment?: string;
  brand?: BrandConfig;
}): Promise<PptxSecretaryResult> {
  try {
    if (input.buffer.byteLength > PPTX_LIMITS.maxUploadBytes) {
      return fail("validating", "file_too_large", "file_too_large", false);
    }
    const name = input.fileName.toLowerCase();
    const assignment = input.assignment || input.fileName;
    let model: PresentationModel;
    if (name.endsWith(".docx")) {
      model = await presentationFromDocx({
        buffer: input.buffer,
        assignment,
        brand: input.brand,
      });
    } else if (name.endsWith(".xlsx")) {
      model = await presentationFromXlsx({
        buffer: input.buffer,
        assignment,
        brand: input.brand,
      });
    } else if (name.endsWith(".pdf")) {
      model = await presentationFromPdf({
        buffer: input.buffer,
        assignment,
        brand: input.brand,
      });
    } else if (name.endsWith(".md") || name.endsWith(".txt")) {
      model = await presentationFromMarkdown({
        markdown: input.buffer.toString("utf8"),
        assignment,
        brand: input.brand,
      });
    } else {
      return fail("validating", "unsupported_file", "unsupported_file", false);
    }
    return finalize(model);
  } catch (error) {
    return fail(
      "analyzing",
      "source_parse_failed",
      error instanceof Error ? error.message : "source_parse_failed",
    );
  }
}

export async function editPptxPresentation(input: {
  presentation: PresentationModel;
  operations: PptxEditOperation[];
  revisionNote?: string;
}): Promise<PptxSecretaryResult> {
  try {
    const edited = applyPptxEdits(input.presentation, input.operations);
    return finalize(edited, [], input.revisionNote ?? "re-edited");
  } catch (error) {
    return fail(
      "edit",
      "pptx_generation_failed",
      error instanceof Error ? error.message : "edit_failed",
    );
  }
}

/** Convert presentation model to PDF via existing PDF generator (parallel quality path). */
export async function convertPresentationToPdf(
  presentation: PresentationModel,
): Promise<{ ok: boolean; buffer: Buffer | null; fileName: string; error?: string }> {
  try {
    const { PdfDeliverableGenerator } = await import(
      "@/lib/deliverables/generators/pdf-generator"
    );
    const markdown = [
      `# ${presentation.presentation_title}`,
      "",
      `目的: ${presentation.purpose}`,
      `聴衆: ${presentation.audience}`,
      "",
      ...presentation.slides.flatMap((slide) => [
        `## ${slide.slide_number}. ${slide.title}`,
        ...slide.content.map((c) => `- ${c.text}`),
        slide.speaker_notes ? `\n_Notes:_ ${slide.speaker_notes.split("\n")[0]}` : "",
        "",
      ]),
    ].join("\n");

    const pdf = await new PdfDeliverableGenerator().generate(
      markdown,
      sanitizePptxFileName(presentation.presentation_title),
    );
    return {
      ok: true,
      buffer: pdf.buffer,
      fileName: pdf.fileName.replace(/\.pdf$/i, "") + ".pdf",
    };
  } catch (error) {
    return {
      ok: false,
      buffer: null,
      fileName: "error.pdf",
      error: error instanceof Error ? error.message : "pdf_conversion_failed",
    };
  }
}

export function presentationToMarkdown(presentation: PresentationModel): string {
  return presentation.slides
    .map(
      (s) =>
        `## ${s.title}\n${s.content.map((c) => `- ${c.text}`).join("\n")}\n\nNotes: ${s.speaker_notes}`,
    )
    .join("\n\n");
}
