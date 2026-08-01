import "server-only";

import mammoth from "mammoth";
import ExcelJS from "exceljs";

import { extractTextFromPdfBuffer } from "@/lib/documents/extract-pdf-text";

import { detectPptxIntent } from "./detect-intent";
import { buildPresentationFromIntent } from "./outlines";
import type { BrandConfig, PresentationModel, SlideChart } from "./types";

function extractKeyPoints(text: string, limit = 12): string[] {
  return text
    .split(/\r?\n|[。．]/)
    .map((line) => line.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter((line) => line.length >= 6 && line.length <= 80)
    .slice(0, limit);
}

export async function presentationFromMarkdown(input: {
  markdown: string;
  assignment?: string;
  brand?: BrandConfig;
}): Promise<PresentationModel> {
  const intent = detectPptxIntent(input.assignment || "資料をスライドにまとめて");
  const hints = extractKeyPoints(input.markdown);
  return buildPresentationFromIntent(intent, {
    brand: input.brand,
    contentHints: hints,
  });
}

export async function presentationFromDocx(input: {
  buffer: Buffer;
  assignment?: string;
  brand?: BrandConfig;
}): Promise<PresentationModel> {
  const result = await mammoth.extractRawText({ buffer: input.buffer });
  return presentationFromMarkdown({
    markdown: result.value || "",
    assignment: input.assignment || "Wordからプレゼン資料を作成",
    brand: input.brand,
  });
}

export async function presentationFromPdf(input: {
  buffer: Buffer;
  assignment?: string;
  brand?: BrandConfig;
}): Promise<PresentationModel> {
  const text = extractTextFromPdfBuffer(input.buffer);
  const model = await presentationFromMarkdown({
    markdown: text,
    assignment: input.assignment || "PDFからプレゼン資料を作成",
    brand: input.brand,
  });
  // Keep source page hint when extract includes page-like markers
  model.slides = model.slides.map((slide) => ({
    ...slide,
    source_references: slide.source_references.length
      ? slide.source_references
      : ["pdf:extracted"],
  }));
  model.warnings = [
    ...model.warnings,
    "PDFからの変換は要点再構成です。完全な元レイアウト再現ではありません。",
  ];
  return model;
}

export async function presentationFromXlsx(input: {
  buffer: Buffer;
  assignment?: string;
  brand?: BrandConfig;
}): Promise<PresentationModel> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    input.buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
  );
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error("source_parse_failed");
  }

  const rows: string[][] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 30) return;
    const values = (row.values as Array<string | number | null | undefined>)
      .slice(1)
      .map((v) => (v == null ? "" : String(v)));
    if (values.some((v) => v.trim())) rows.push(values);
  });

  const headers = rows[0] ?? ["項目", "値"];
  const dataRows = rows.slice(1, 8);
  const categories = dataRows.map((r) => r[0] || "").filter(Boolean).slice(0, 6);
  const values = dataRows
    .map((r) => Number(String(r[1] ?? "").replace(/[,，]/g, "")))
    .map((n) => (Number.isFinite(n) ? n : 0))
    .slice(0, categories.length);

  const intent = detectPptxIntent(input.assignment || "Excelから報告資料を作成");
  intent.kind = intent.kind === "generic" ? "monthly_report" : intent.kind;
  const model = buildPresentationFromIntent(intent, { brand: input.brand });

  const chart: SlideChart = {
    type: categories.length > 0 && values.some((v) => v !== 0) ? "bar" : "kpi",
    title: sheet.name,
    categories: categories.length ? categories : ["データ未検出"],
    series: [
      {
        name: headers[1] || "値",
        values: values.length ? values : [0],
      },
    ],
    showLegend: true,
  };

  // Inject chart into first chart/kpi slide or append
  const target =
    model.slides.find((s) => s.type === "chart" || s.type === "kpi_cards") ??
    model.slides[2];
  if (target) {
    target.charts = [chart];
    target.table = {
      headers: headers.slice(0, 4),
      rows: dataRows.map((r) => r.slice(0, 4)),
    };
    target.source_references = [`xlsx:${sheet.name}`];
    target.speaker_notes = [
      "この数値はアップロードされたExcelから取得しています。",
      "存在しない数値は追加していません。",
      target.speaker_notes,
    ].join("\n");
  }

  model.warnings.push("Excelに無い数値は生成していません。");
  return model;
}

export function presentationFromAssignment(
  assignment: string,
  brand?: BrandConfig,
): PresentationModel {
  const intent = detectPptxIntent(assignment);
  return buildPresentationFromIntent(intent, { brand });
}
