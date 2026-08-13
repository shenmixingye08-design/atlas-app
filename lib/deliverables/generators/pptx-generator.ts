import "server-only";

import pptxgen from "pptxgenjs";

import { resolveEmbeddedImage } from "../embedded-image";
import { parseDeliverableContent } from "../parse-content";
import type { ParsedDeliverable } from "../parse-content";
import {
  contentBodyOrigin,
  paintComparison,
  paintContentHeading,
  paintCta,
  paintKeyNumber,
  paintKpiCards,
  paintProcess,
  paintSectionDivider,
  paintTitleSlide,
  paintTwoColumn,
} from "../pptx-templates/layouts";
import {
  injectPptxThemeAccent,
  resolvePptxDesign,
  type ResolvedPptxDesign,
} from "../pptx-templates";
import { buildSlideStoryboard, type SlidePlan } from "../pptx-storyboard/storyboard";
import type { PptxChartSpec } from "../pptx-storyboard/charts";
import type { DeliverableGenerator, GeneratedDeliverableFile } from "../types";

import { createDeliverableFile, formatGeneratedDate } from "./shared";

type PptxGenerateOptions = {
  brandColorHex?: string | null;
  companyName?: string | null;
  assignment?: string | null;
  title?: string | null;
  logoDataUrl?: string | null;
  powerpoint?: {
    brandColorHex?: string | null;
    fontFace?: string | null;
    titleAlign?: "left" | "center" | "right" | null;
    logoDataUrl?: string | null;
    templateId?: string | null;
    theme?: string | null;
    slideCountHint?: number | null;
  } | null;
};

function addBodyBullets(
  slide: pptxgen.Slide,
  items: string[],
  design: ResolvedPptxDesign,
): void {
  const origin = contentBodyOrigin(design);
  slide.addText(
    items.map((item) => ({ text: item, options: { bullet: true } })),
    {
      x: origin.x,
      y: origin.y,
      w: origin.w,
      h: 3.8,
      fontSize: Math.max(design.template.bodyFontSize, 16),
      color: design.colors.text,
      fontFace: design.fontFace,
      valign: "top",
      paraSpaceAfter: 10,
    },
  );
}

function addRealTable(
  slide: pptxgen.Slide,
  headers: string[],
  rows: string[][],
  design: ResolvedPptxDesign,
): void {
  const colCount = Math.max(headers.length, 1);
  const origin = contentBodyOrigin(design);
  const colW = Array.from({ length: colCount }, () => origin.w / colCount);
  const tableRows: pptxgen.TableRow[] = [
    headers.map((header) => ({
      text: header || " ",
      options: {
        bold: true,
        color: design.colors.onAccent,
        fill: { color: design.colors.accent },
        align: "center" as const,
        valign: "middle" as const,
      },
    })),
    ...rows.map((row) =>
      Array.from({ length: colCount }, (_, index) => ({
        text: formatTableCell(row[index] || " "),
        options: {
          color: design.colors.text,
          align: looksNumeric(row[index]) ? ("right" as const) : ("left" as const),
          valign: "middle" as const,
        },
      })),
    ),
  ];

  slide.addTable(tableRows, {
    x: origin.x,
    y: origin.y,
    w: origin.w,
    colW,
    border: [
      { pt: 0.5, color: "B0B0B0" },
      { pt: 0.5, color: "B0B0B0" },
      { pt: 0.5, color: "B0B0B0" },
      { pt: 0.5, color: "B0B0B0" },
    ],
    fontFace: design.fontFace,
    fontSize: 13,
    color: design.colors.text,
  });
}

function looksNumeric(value: string | undefined): boolean {
  if (!value) return false;
  return /^-?[\d,¥￥円.%％]+$/.test(value.replace(/\s/g, ""));
}

function formatTableCell(value: string): string {
  const trimmed = value.trim();
  if (/^-?\d+$/.test(trimmed.replace(/,/g, ""))) {
    const num = Number(trimmed.replace(/,/g, ""));
    if (Number.isFinite(num)) return num.toLocaleString("ja-JP");
  }
  return trimmed || " ";
}

function addChart(
  pptx: pptxgen,
  slide: pptxgen.Slide,
  spec: PptxChartSpec,
  design: ResolvedPptxDesign,
): boolean {
  const origin = contentBodyOrigin(design);
  // pptxgenjs 4 ChartType has bar / line / pie (no separate column type).
  const type =
    spec.kind === "line"
      ? pptx.ChartType.line
      : spec.kind === "pie"
        ? pptx.ChartType.pie
        : pptx.ChartType.bar;
  try {
    slide.addChart(type, [
      { name: spec.title, labels: spec.categories, values: spec.values },
    ], {
      x: origin.x,
      y: origin.y,
      w: origin.w,
      h: 3.6,
      showValue: spec.kind !== "pie",
      showLegend: spec.kind === "pie",
      chartColors: [design.colors.accent, "5B8FA8", "8FAADC", "C5D9F1"],
      chartArea: { fill: { color: "FFFFFF" } },
    });
    return true;
  } catch {
    return false;
  }
}

async function addRealImage(
  slide: pptxgen.Slide,
  image: { caption: string; dataUrl?: string },
  design: ResolvedPptxDesign,
): Promise<void> {
  const origin = contentBodyOrigin(design);
  const resolved = await resolveEmbeddedImage({
    dataUrl: image.dataUrl,
    caption: image.caption,
    marker: "P108IMG",
  });
  slide.addImage({
    data: resolved.pptxData,
    x: origin.x + 1.4,
    y: origin.y,
    w: 5.6,
    h: 2.8,
  });
  slide.addText(image.caption, {
    x: origin.x,
    y: origin.y + 2.95,
    w: origin.w,
    h: 0.35,
    fontSize: 12,
    color: design.colors.muted,
    align: "center",
    fontFace: design.fontFace,
  });
}

async function renderSlide(
  pptx: pptxgen,
  plan: SlidePlan,
  design: ResolvedPptxDesign,
): Promise<{ tables: number; images: number }> {
  const slide = pptx.addSlide();
  let tables = 0;
  let images = 0;

  if (plan.layout === "title") {
    paintTitleSlide(pptx, slide, plan.title, plan.message, design);
    const footer =
      design.companyName?.trim() ||
      `MINERVOT · ${formatGeneratedDate()}`;
    slide.addText(footer, {
      x: 0.6,
      y: 4.85,
      w: 8.8,
      h: 0.35,
      fontSize: 11,
      color:
        design.template.titleLayout === "full-bleed"
          ? design.colors.accentLight
          : design.colors.muted,
      align: "center",
      fontFace: design.fontFace,
    });
    if (design.logoDataUrl) {
      const logo = await resolveEmbeddedImage({
        dataUrl: design.logoDataUrl,
        caption: "logo",
      });
      slide.addImage({
        data: logo.pptxData,
        x: 8.6,
        y: 0.25,
        w: 0.9,
        h: 0.9,
      });
    }
    return { tables, images };
  }

  if (plan.layout === "divider") {
    paintSectionDivider(pptx, slide, plan.title, design);
    return { tables, images };
  }

  if (plan.layout === "cta") {
    paintCta(pptx, slide, plan.title, plan.message, design);
    return { tables, images };
  }

  paintContentHeading(pptx, slide, plan.title, design);

  switch (plan.layout) {
    case "kpi_cards":
      if (plan.kpis?.length) paintKpiCards(pptx, slide, plan.kpis, design);
      break;
    case "key_number":
      if (plan.kpis?.[0]) {
        paintKeyNumber(pptx, slide, plan.kpis[0].value, plan.kpis[0].label, design);
      }
      break;
    case "two_column":
      if (plan.columns) {
        paintTwoColumn(pptx, slide, plan.columns.left, plan.columns.right, design);
      }
      break;
    case "comparison":
      if (plan.comparison) paintComparison(pptx, slide, plan.comparison, design);
      break;
    case "process":
    case "timeline":
      if (plan.steps?.length) {
        paintProcess(pptx, slide, plan.steps, design, plan.layout);
      }
      break;
    case "table":
      if (plan.table) {
        addRealTable(slide, plan.table.headers, plan.table.rows, design);
        tables += 1;
      }
      break;
    case "chart":
      if (plan.chart) addChart(pptx, slide, plan.chart, design);
      else if (plan.bullets?.length) addBodyBullets(slide, plan.bullets, design);
      break;
    case "image":
      if (plan.image) {
        await addRealImage(slide, plan.image, design);
        images += 1;
      }
      break;
    case "summary":
    case "bullets":
    default:
      if (plan.bullets?.length) addBodyBullets(slide, plan.bullets, design);
      break;
  }

  return { tables, images };
}

async function buildPptxBuffer(
  parsed: ParsedDeliverable,
  options?: PptxGenerateOptions,
): Promise<{
  buffer: Buffer;
  tables: number;
  images: number;
  design: ResolvedPptxDesign;
}> {
  const design = resolvePptxDesign({
    templateId: options?.powerpoint?.templateId,
    theme: options?.powerpoint?.theme,
    assignment: options?.assignment ?? options?.title,
    brandColorHex:
      options?.powerpoint?.brandColorHex ?? options?.brandColorHex,
    fontFace: options?.powerpoint?.fontFace,
    titleAlign: options?.powerpoint?.titleAlign,
    slideCountHint: options?.powerpoint?.slideCountHint,
    logoDataUrl:
      options?.powerpoint?.logoDataUrl ?? options?.logoDataUrl ?? null,
    companyName: options?.companyName,
  });

  const { slides } = buildSlideStoryboard({
    parsed,
    assignment: options?.assignment ?? options?.title,
    showAgenda: design.template.showAgenda,
    showSectionDividers: design.template.showSectionDividers,
    showClosing: design.template.showClosing,
    slideCountHint: design.slideCountHint,
  });

  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_16x9";
  pptx.author = design.companyName ?? "MINERVOT";
  pptx.title = parsed.title;
  pptx.subject = `MINERVOT · ${design.template.id}`;

  const titleSlide = slides[0];
  if (!titleSlide || titleSlide.layout !== "title") {
    throw new Error("PowerPoint生成失敗: missing_title_slide");
  }

  let tables = 0;
  let images = 0;
  for (const plan of slides) {
    const stats = await renderSlide(pptx, plan, design);
    tables += stats.tables;
    images += stats.images;
  }

  const output = await pptx.write({ outputType: "nodebuffer" });
  let buffer = Buffer.from(output as ArrayBuffer);

  const themed = await injectPptxThemeAccent(buffer, design.colors.accent);
  if (!themed.themePatched) {
    throw new Error(
      `PowerPoint生成失敗: theme_inject_${themed.error ?? "failed"}`,
    );
  }
  buffer = Buffer.from(themed.buffer);

  return { buffer, tables, images, design };
}

function countSourceTables(parsed: ParsedDeliverable): number {
  return parsed.sections.reduce(
    (sum, section) =>
      sum + section.blocks.filter((block) => block.type === "table").length,
    0,
  );
}

function countSourceImages(parsed: ParsedDeliverable): number {
  return parsed.sections.reduce(
    (sum, section) =>
      sum +
      section.blocks.filter((block) => block.type === "imagePlaceholder").length,
    0,
  );
}

/** Production PowerPoint (.pptx) generator using pptxgenjs + design templates. */
export class PptxDeliverableGenerator implements DeliverableGenerator {
  readonly format = "pptx" as const;

  async generate(
    content: string,
    baseFileName: string,
    options?: PptxGenerateOptions,
  ): Promise<GeneratedDeliverableFile> {
    const parsed = parseDeliverableContent(content);
    const sourceTables = countSourceTables(parsed);
    const sourceImages = countSourceImages(parsed);
    const { buffer, tables, images } = await buildPptxBuffer(parsed, options);
    if (!buffer?.byteLength || buffer.subarray(0, 2).toString("utf8") !== "PK") {
      throw new Error("PowerPoint生成失敗: invalid pptx zip");
    }
    if (tables < sourceTables) {
      throw new Error("PowerPoint生成失敗: pptx_tables_omitted");
    }
    if (images < sourceImages) {
      throw new Error("PowerPoint生成失敗: pptx_images_omitted");
    }
    return createDeliverableFile("pptx", baseFileName, buffer, false);
  }
}

/** @deprecated Use {@link PptxDeliverableGenerator}. */
export const PptxPlaceholderGenerator = PptxDeliverableGenerator;
