import "server-only";

import { PDFDocument, StandardFonts } from "pdf-lib";
import mammoth from "mammoth";
import ExcelJS from "exceljs";

import { PdfDeliverableGenerator } from "@/lib/deliverables/generators/pdf-generator";
import { DocxDeliverableGenerator } from "@/lib/deliverables/generators/docx-generator";
import { workbookFromCsv } from "@/lib/excel-secretary/from-tabular";
import { exportWorkbook, workbookModelFromXlsxBuffer } from "@/lib/excel-secretary/export";
import { workbookFromPdfBuffer } from "@/lib/excel-secretary/from-documents";
import { createPptxFromUpload, createPptxFromAssignment } from "@/lib/pptx-secretary/service";

import { ArtifactPlatformError } from "./errors";
import type { ArtifactFormat, ConversionQuality } from "./types";

export type EngineConvertInput = {
  sourceFormat: ArtifactFormat;
  targetFormat: ArtifactFormat;
  buffer: Buffer;
  title: string;
  sourceContent?: string;
  fileName?: string;
};

export type EngineConvertOutput = {
  buffer: Buffer;
  quality: Exclude<ConversionQuality, "unsupported">;
  warnings: string[];
  sourceContent: string;
};

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  // Lightweight text extraction: scan for printable Latin/JP-ish strings between streams.
  // Honest partial quality — not a full PDF text engine.
  const raw = buffer.toString("latin1");
  const chunks: string[] = [];
  const re = /\(([^)\\]|\\.)*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) && chunks.length < 400) {
    const inner = m[0]
      .slice(1, -1)
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "")
      .replace(/\\\(/g, "(")
      .replace(/\\\)/g, ")")
      .replace(/\\\\/g, "\\");
    if (inner.trim().length >= 2) chunks.push(inner);
  }
  const text = chunks.join("\n").trim();
  return text || "（PDFから抽出できるテキストがほとんどありませんでした）";
}

async function imageToPdf(buffer: Buffer, format: "png" | "jpg"): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const embedded =
    format === "png"
      ? await pdf.embedPng(buffer)
      : await pdf.embedJpg(buffer);
  const page = pdf.addPage([embedded.width, embedded.height]);
  page.drawImage(embedded, {
    x: 0,
    y: 0,
    width: embedded.width,
    height: embedded.height,
  });
  return Buffer.from(await pdf.save());
}

async function markdownToPdf(markdown: string, title: string): Promise<Buffer> {
  const gen = new PdfDeliverableGenerator();
  const file = await gen.generate(markdown, title);
  return file.buffer;
}

async function markdownToDocx(markdown: string, title: string): Promise<Buffer> {
  const gen = new DocxDeliverableGenerator();
  const file = await gen.generate(markdown, title);
  return file.buffer;
}

export async function runConversionEngine(
  input: EngineConvertInput
): Promise<EngineConvertOutput> {
  const { sourceFormat, targetFormat, buffer, title } = input;
  const warnings: string[] = [];
  const key = `${sourceFormat}->${targetFormat}`;

  try {
    // --- to PDF ---
    if (targetFormat === "pdf") {
      if (sourceFormat === "docx") {
        const extracted = await mammoth.extractRawText({ buffer });
        const md =
          input.sourceContent?.trim() ||
          `# ${title}\n\n${extracted.value || "（本文を抽出できませんでした）"}`;
        warnings.push("Word→PDFはテキスト再構成です。レイアウト完全再現ではありません。");
        return {
          buffer: await markdownToPdf(md, title),
          quality: "high",
          warnings,
          sourceContent: md,
        };
      }
      if (sourceFormat === "xlsx") {
        const model = await workbookModelFromXlsxBuffer(buffer);
        const exported = await exportWorkbook(model, "pdf");
        warnings.push(exported.warning ?? "Excel→PDFは表の要約PDFです。");
        return {
          buffer: exported.buffer,
          quality: "needs_review",
          warnings,
          sourceContent: input.sourceContent ?? "",
        };
      }
      if (sourceFormat === "pptx") {
        // Structure → document PDF via assignment from title + source
        const md =
          input.sourceContent?.trim() ||
          `# ${title}\n\nPowerPoint資料の提出用PDFです。\nスライド構成を文書形式でまとめています。`;
        warnings.push(
          "PowerPoint→PDFはスライドのピクセル完全再現ではなく、構成ベースの文書PDFです。"
        );
        return {
          buffer: await markdownToPdf(md, title),
          quality: "needs_review",
          warnings,
          sourceContent: md,
        };
      }
      if (sourceFormat === "png" || sourceFormat === "jpg") {
        return {
          buffer: await imageToPdf(buffer, sourceFormat),
          quality: "high",
          warnings,
          sourceContent: "",
        };
      }
    }

    // --- PDF → Word / Excel / PPTX ---
    if (sourceFormat === "pdf" && targetFormat === "docx") {
      const text = await extractTextFromPdf(buffer);
      const md = `# ${title}\n\n${text}`;
      warnings.push("PDF→Wordはテキスト抽出ベースです。表・画像は欠落する場合があります。");
      return {
        buffer: await markdownToDocx(md, title),
        quality: "needs_review",
        warnings,
        sourceContent: md,
      };
    }
    if (sourceFormat === "pdf" && targetFormat === "xlsx") {
      const model = await workbookFromPdfBuffer({
        buffer,
        title,
      });
      const exported = await exportWorkbook(model, "xlsx");
      warnings.push("PDF→Excelは表推定です。列ズレの確認が必要です。");
      return {
        buffer: exported.buffer,
        quality: "low_confidence",
        warnings,
        sourceContent: "",
      };
    }
    if (sourceFormat === "pdf" && targetFormat === "pptx") {
      const text = await extractTextFromPdf(buffer);
      const result = await createPptxFromAssignment({
        assignment: `${title} の説明資料`,
        contentMarkdown: text,
      });
      if (!result.ok || !result.buffer) {
        throw new ArtifactPlatformError(
          "conversion_failed",
          result.errors[0]?.message ?? "pdf->pptx failed"
        );
      }
      warnings.push(...(result.warnings ?? []), "PDF→PPTXは低信頼の再構成です。");
      return {
        buffer: result.buffer,
        quality: "low_confidence",
        warnings,
        sourceContent: text,
      };
    }

    // --- Office → PPTX ---
    if (targetFormat === "pptx" && (sourceFormat === "docx" || sourceFormat === "xlsx")) {
      const result = await createPptxFromUpload({
        fileName: input.fileName ?? `${title}.${sourceFormat}`,
        mimeType:
          sourceFormat === "docx"
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer,
        assignment: title,
      });
      if (!result.ok || !result.buffer) {
        throw new ArtifactPlatformError(
          "conversion_failed",
          result.errors[0]?.message ?? `${key} failed`
        );
      }
      warnings.push(...(result.warnings ?? []));
      return {
        buffer: result.buffer,
        quality: "needs_review",
        warnings,
        sourceContent: input.sourceContent ?? "",
      };
    }

    // --- CSV ↔ Excel ---
    if (sourceFormat === "csv" && targetFormat === "xlsx") {
      const model = workbookFromCsv({
        csvText: buffer.toString("utf8"),
        title,
      });
      const exported = await exportWorkbook(model, "xlsx");
      return {
        buffer: exported.buffer,
        quality: "high",
        warnings,
        sourceContent: buffer.toString("utf8").slice(0, 8000),
      };
    }
    if (sourceFormat === "xlsx" && targetFormat === "csv") {
      const model = await workbookModelFromXlsxBuffer(buffer);
      const exported = await exportWorkbook(model, "csv");
      return {
        buffer: exported.buffer,
        quality: "high",
        warnings,
        sourceContent: "",
      };
    }

    // --- Image → Word / Excel (honest low confidence text placeholder) ---
    if (
      (sourceFormat === "png" || sourceFormat === "jpg") &&
      (targetFormat === "docx" || targetFormat === "xlsx")
    ) {
      warnings.push(
        "画像→文書はOCRパイプライン未接続のため、プレースホルダ文書のみ生成します。Vision連携後に精度が上がります。"
      );
      const md = `# ${title}\n\n（画像からの自動読み取りは要確認です。元画像を参照して内容を補完してください。）`;
      if (targetFormat === "docx") {
        return {
          buffer: await markdownToDocx(md, title),
          quality: "low_confidence",
          warnings,
          sourceContent: md,
        };
      }
      const model = workbookFromCsv({
        csvText: "項目,内容\n画像ファイル," + (input.fileName ?? title) + "\n状態,要確認",
        title,
      });
      const exported = await exportWorkbook(model, "xlsx");
      return {
        buffer: exported.buffer,
        quality: "low_confidence",
        warnings,
        sourceContent: md,
      };
    }

    throw new ArtifactPlatformError(
      "unsupported_conversion",
      `No engine for ${key}`,
      { sourceFormat, targetFormat }
    );
  } catch (error) {
    if (error instanceof ArtifactPlatformError) throw error;
    throw new ArtifactPlatformError(
      "conversion_failed",
      error instanceof Error ? error.message : "conversion_failed",
      { sourceFormat, targetFormat, engineKey: key }
    );
  }
}

/** Used by tests to ensure we never claim conversion by renaming only. */
export function isExtensionOnlyFakeConversion(
  source: Buffer,
  target: Buffer,
  sourceFormat: string,
  targetFormat: string
): boolean {
  if (sourceFormat === targetFormat) return false;
  if (source.equals(target)) return true;
  // Same bytes with different claimed format = fake
  return false;
}

export async function peekWorkbookSheetCount(buffer: Buffer): Promise<number> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(
    buffer as unknown as Parameters<typeof wb.xlsx.load>[0]
  );
  return wb.worksheets.length;
}

export async function peekPdfPageHint(buffer: Buffer): Promise<number> {
  const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
  return pdf.getPageCount();
}

/** Tiny helper retained for future font embedding paths. */
export async function emptyPdfWithTitle(title: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText(title.slice(0, 80), { x: 50, y: 700, size: 14, font });
  return Buffer.from(await pdf.save());
}
