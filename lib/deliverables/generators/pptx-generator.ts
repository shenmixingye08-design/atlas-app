import "server-only";

import pptxgen from "pptxgenjs";

import { ui } from "@/lib/i18n";
import {
  extractSummaryPoints,
  parseDeliverableContent,
} from "../parse-content";
import type {
  ContentBlock,
  ParsedDeliverable,
  ParsedSection,
} from "../parse-content";
import {
  fitFontSize,
  normalizeJapaneseBusinessText,
} from "../pptx-production/japanese-normalize";
import { assertPptxProductionOrThrow } from "../pptx-production/pptx-inspect";
import type { DeliverableGenerator, GeneratedDeliverableFile } from "../types";

import { createDeliverableFile, formatGeneratedDate } from "./shared";

/** Corporate-safe palette (not purple-on-white). */
const BRAND = "1F4E79";
const BRAND_SOFT = "E8EEF5";
const ACCENT = "2E7D6F";
const TEXT_DARK = "1A1A1A";
const TEXT_MUTED = "5C5C5C";
const CARD_BG = "F7F9FB";
const FONT = "Yu Gothic";
const FONT_FALLBACK = "Meiryo";

type AspectRatio = "16:9" | "4:3";

function jp(text: string): string {
  return normalizeJapaneseBusinessText(text);
}

function fontFace(): string {
  return FONT;
}

function addTopBar(pptx: pptxgen, slide: pptxgen.Slide): void {
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: "100%",
    h: 0.1,
    fill: { color: BRAND },
  });
}

function addSlideTitle(
  pptx: pptxgen,
  slide: pptxgen.Slide,
  title: string,
  subtitle?: string,
): void {
  addTopBar(pptx, slide);
  slide.addText(jp(title), {
    x: 0.7,
    y: 1.7,
    w: 8.6,
    h: 1.3,
    fontSize: fitFontSize(title, 34, 22, 60),
    bold: true,
    color: BRAND,
    align: "center",
    fontFace: fontFace(),
    valign: "middle",
  });
  if (subtitle) {
    slide.addText(jp(subtitle), {
      x: 0.7,
      y: 3.1,
      w: 8.6,
      h: 0.6,
      fontSize: 16,
      color: TEXT_MUTED,
      align: "center",
      fontFace: fontFace(),
    });
  }
}

function addSectionDivider(
  pptx: pptxgen,
  slide: pptxgen.Slide,
  title: string,
): void {
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: "100%",
    h: "100%",
    fill: { color: BRAND },
  });
  slide.addText(jp(title), {
    x: 0.7,
    y: 2.2,
    w: 8.6,
    h: 1.1,
    fontSize: fitFontSize(title, 32, 20, 48),
    bold: true,
    color: "FFFFFF",
    align: "center",
    fontFace: fontFace(),
  });
}

function addContentHeading(
  pptx: pptxgen,
  slide: pptxgen.Slide,
  title: string,
): void {
  addTopBar(pptx, slide);
  slide.addText(jp(title), {
    x: 0.55,
    y: 0.28,
    w: 8.9,
    h: 0.55,
    fontSize: fitFontSize(title, 22, 16, 48),
    bold: true,
    color: BRAND,
    fontFace: fontFace(),
  });
  slide.addShape(pptx.ShapeType.line, {
    x: 0.55,
    y: 0.88,
    w: 8.9,
    h: 0,
    line: { color: BRAND_SOFT, width: 1.5 },
  });
}

function addBodyBullets(
  slide: pptxgen.Slide,
  items: string[],
  options?: { y?: number; numbered?: boolean; fontSize?: number },
): void {
  const texts = items.map((item, index) => ({
    text: jp(options?.numbered ? `${index + 1}. ${item}` : item),
    options: {
      bullet: options?.numbered ? false : true,
      breakLine: true,
    },
  }));
  slide.addText(texts, {
    x: 0.7,
    y: options?.y ?? 1.15,
    w: 8.6,
    h: 4.0,
    fontSize: options?.fontSize ?? 17,
    color: TEXT_DARK,
    fontFace: fontFace(),
    valign: "top",
    paraSpaceAfter: 8,
  });
}

function addBodyParagraph(
  slide: pptxgen.Slide,
  text: string,
  options?: { y?: number; fontSize?: number },
): void {
  const normalized = jp(text);
  slide.addText(normalized, {
    x: 0.7,
    y: options?.y ?? 1.15,
    w: 8.6,
    h: 4.0,
    fontSize: options?.fontSize ?? fitFontSize(normalized, 16, 12, 500),
    color: TEXT_DARK,
    fontFace: fontFace(),
    valign: "top",
  });
}

function addTableSlide(
  pptx: pptxgen,
  sectionTitle: string,
  headers: string[],
  rows: string[][],
): void {
  const slide = pptx.addSlide();
  addContentHeading(pptx, slide, sectionTitle);
  const tableRows: pptxgen.TableRow[] = [
    headers.map((h) => ({
      text: jp(h),
      options: {
        bold: true,
        color: "FFFFFF",
        fill: { color: BRAND },
        align: "center",
        fontFace: fontFace(),
        fontSize: 12,
      },
    })),
    ...rows.slice(0, 12).map((row) =>
      headers.map((_, i) => ({
        text: jp(row[i] ?? ""),
        options: {
          color: TEXT_DARK,
          fill: { color: "FFFFFF" },
          fontFace: fontFace(),
          fontSize: 11,
          valign: "middle" as const,
        },
      })),
    ),
  ];
  slide.addTable(tableRows, {
    x: 0.5,
    y: 1.15,
    w: 9.0,
    colW: headers.map(() => 9.0 / Math.max(headers.length, 1)),
    border: [
      { pt: 0.5, color: "B0B8C2" },
      { pt: 0.5, color: "B0B8C2" },
      { pt: 0.5, color: "B0B8C2" },
      { pt: 0.5, color: "B0B8C2" },
    ],
    fontFace: fontFace(),
  });
  slide.addNotes(`${sectionTitle} — 表スライド`);
}

function parseNumeric(raw: string): number | null {
  const n = Number(
    raw.replace(/[,，\s¥￥円%％]/g, "").replace(/%$/, ""),
  );
  return Number.isFinite(n) ? n : null;
}

function addChartFromTable(
  pptx: pptxgen,
  sectionTitle: string,
  headers: string[],
  rows: string[][],
  chartIndex: number,
): boolean {
  if (headers.length < 2 || rows.length < 2) return false;
  const labelCol = 0;
  let valueCol = -1;
  for (let c = 1; c < headers.length; c += 1) {
    const nums = rows
      .map((r) => parseNumeric(r[c] ?? ""))
      .filter((v): v is number => v != null);
    if (nums.length >= Math.ceil(rows.length * 0.6)) {
      valueCol = c;
      break;
    }
  }
  if (valueCol < 0) return false;

  const labels = rows.map((r) => jp(r[labelCol] ?? "")).slice(0, 10);
  const values = rows
    .map((r) => parseNumeric(r[valueCol] ?? "") ?? 0)
    .slice(0, 10);

  const kinds = ["bar", "line", "pie", "bar"] as const;
  const kind = kinds[chartIndex % kinds.length]!;
  const stacked = chartIndex % 4 === 3;

  const slide = pptx.addSlide();
  addContentHeading(pptx, slide, `${sectionTitle} — グラフ`);
  slide.addChart(
    kind,
    [
      {
        name: jp(headers[valueCol] ?? "値"),
        labels,
        values,
      },
    ],
    {
      x: 0.6,
      y: 1.15,
      w: 8.8,
      h: 3.9,
      showTitle: true,
      title: jp(headers[valueCol] ?? "データ"),
      showLegend: true,
      barGrouping: stacked ? "stacked" : "clustered",
      chartColors: [BRAND, ACCENT, "C4A35A", "6B7C93"],
      fontFace: fontFace(),
    },
  );
  slide.addNotes(`${sectionTitle} — グラフ`);
  return true;
}

function addKpiCards(
  pptx: pptxgen,
  sectionTitle: string,
  headers: string[],
  rows: string[][],
): boolean {
  if (headers.length < 2 || rows.length < 1 || rows.length > 4) return false;
  const cards = rows.slice(0, 4).map((row) => ({
    label: jp(row[0] ?? headers[0] ?? "KPI"),
    value: jp(row[1] ?? ""),
  }));
  if (!cards.every((c) => c.value.length > 0)) return false;

  const slide = pptx.addSlide();
  addContentHeading(pptx, slide, `${sectionTitle} — KPI`);
  const gap = 0.25;
  const cardW = (9.0 - gap * (cards.length - 1)) / cards.length;
  cards.forEach((card, i) => {
    const x = 0.5 + i * (cardW + gap);
    slide.addShape(pptx.ShapeType.roundRect, {
      x,
      y: 1.5,
      w: cardW,
      h: 2.6,
      fill: { color: CARD_BG },
      line: { color: BRAND_SOFT, width: 1 },
      shadow: {
        type: "outer",
        color: "000000",
        blur: 4,
        offset: 1,
        opacity: 0.08,
      },
    });
    slide.addText(card.label, {
      x,
      y: 1.75,
      w: cardW,
      h: 0.6,
      fontSize: 13,
      color: TEXT_MUTED,
      align: "center",
      fontFace: fontFace(),
    });
    slide.addText(card.value, {
      x,
      y: 2.5,
      w: cardW,
      h: 1.0,
      fontSize: fitFontSize(card.value, 28, 16, 12),
      bold: true,
      color: BRAND,
      align: "center",
      fontFace: fontFace(),
    });
  });
  slide.addNotes(`${sectionTitle} — KPIカード`);
  return true;
}

function addProcessLayout(
  pptx: pptxgen,
  sectionTitle: string,
  items: string[],
): void {
  const slide = pptx.addSlide();
  addContentHeading(pptx, slide, sectionTitle);
  const steps = items.slice(0, 5);
  const w = Math.min(1.7, 8.5 / steps.length - 0.15);
  steps.forEach((item, i) => {
    const x = 0.5 + i * (w + 0.35);
    slide.addShape(pptx.ShapeType.roundRect, {
      x,
      y: 1.8,
      w,
      h: 2.2,
      fill: { color: i % 2 === 0 ? BRAND : ACCENT },
    });
    slide.addText(`${i + 1}`, {
      x,
      y: 1.95,
      w,
      h: 0.4,
      fontSize: 14,
      color: "FFFFFF",
      align: "center",
      fontFace: fontFace(),
    });
    slide.addText(jp(item), {
      x: x + 0.08,
      y: 2.45,
      w: w - 0.16,
      h: 1.3,
      fontSize: 12,
      color: "FFFFFF",
      align: "center",
      fontFace: fontFace(),
      valign: "top",
    });
    if (i < steps.length - 1) {
      slide.addShape(pptx.ShapeType.rightArrow, {
        x: x + w + 0.02,
        y: 2.65,
        w: 0.28,
        h: 0.28,
        fill: { color: BRAND_SOFT },
      });
    }
  });
  slide.addNotes(`${sectionTitle} — プロセス（SmartArt互換）`);
}

function addImageSlide(
  pptx: pptxgen,
  sectionTitle: string,
  caption: string,
  dataUrl?: string,
): void {
  const slide = pptx.addSlide();
  addContentHeading(pptx, slide, sectionTitle);
  if (dataUrl?.startsWith("data:image/")) {
    try {
      slide.addImage({
        data: dataUrl,
        x: 1.5,
        y: 1.2,
        w: 7.0,
        h: 3.4,
      });
    } catch {
      slide.addShape(pptx.ShapeType.rect, {
        x: 1.5,
        y: 1.2,
        w: 7.0,
        h: 3.4,
        fill: { color: "F0F0F0" },
        line: { color: "CCCCCC", width: 1 },
      });
    }
  } else {
    slide.addShape(pptx.ShapeType.rect, {
      x: 1.5,
      y: 1.2,
      w: 7.0,
      h: 3.4,
      fill: { color: "F0F0F0" },
      line: { color: "CCCCCC", width: 1 },
    });
    slide.addText(`[ ${ui.generated.imagePlaceholder} ]`, {
      x: 1.5,
      y: 2.5,
      w: 7.0,
      h: 0.5,
      fontSize: 14,
      color: "888888",
      align: "center",
      fontFace: fontFace(),
    });
  }
  slide.addText(jp(caption), {
    x: 1.5,
    y: 4.7,
    w: 7.0,
    h: 0.35,
    fontSize: 12,
    color: TEXT_MUTED,
    align: "center",
    fontFace: fontFace(),
  });
  slide.addNotes(`${sectionTitle} — ${caption}`);
}

function chunkItems<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out.length > 0 ? out : [[]];
}

function addSectionSlides(
  pptx: pptxgen,
  section: ParsedSection,
  chartCounter: { n: number },
): void {
  const divider = pptx.addSlide();
  addSectionDivider(pptx, divider, section.title);
  divider.addNotes(`セクション: ${section.title}`);

  const paragraphs: string[] = [];
  const bullets: string[] = [];
  const numbered: string[] = [];

  for (const block of section.blocks) {
    switch (block.type) {
      case "paragraph":
        if (block.text.trim()) paragraphs.push(block.text);
        break;
      case "bulletList":
        bullets.push(...block.items);
        break;
      case "numberedList":
        numbered.push(...block.items);
        break;
      case "table": {
        addTableSlide(pptx, section.title, block.headers, block.rows);
        const madeChart = addChartFromTable(
          pptx,
          section.title,
          block.headers,
          block.rows,
          chartCounter.n,
        );
        if (madeChart) chartCounter.n += 1;
        addKpiCards(pptx, section.title, block.headers, block.rows);
        break;
      }
      case "imagePlaceholder":
        addImageSlide(
          pptx,
          section.title,
          block.caption,
          block.dataUrl,
        );
        break;
      default:
        break;
    }
  }

  if (numbered.length >= 3 && numbered.length <= 5) {
    addProcessLayout(pptx, `${section.title} — 流れ`, numbered);
  }

  for (const chunk of chunkItems(bullets, 6)) {
    if (chunk.length === 0) continue;
    const slide = pptx.addSlide();
    addContentHeading(pptx, slide, section.title);
    addBodyBullets(slide, chunk, { fontSize: 17 });
    slide.addNotes(section.title);
  }

  for (const chunk of chunkItems(numbered, 6)) {
    if (chunk.length === 0) continue;
    if (numbered.length >= 3 && numbered.length <= 5) continue;
    const slide = pptx.addSlide();
    addContentHeading(pptx, slide, section.title);
    addBodyBullets(slide, chunk, { numbered: true, fontSize: 17 });
    slide.addNotes(section.title);
  }

  for (const para of paragraphs) {
    const slide = pptx.addSlide();
    addContentHeading(pptx, slide, section.title);
    addBodyParagraph(slide, para);
    slide.addNotes(section.title);
  }

  // Ensure section has at least one content slide besides divider
  const hasContent = section.blocks.length > 0;
  if (!hasContent) {
    const slide = pptx.addSlide();
    addContentHeading(pptx, slide, section.title);
    addBodyParagraph(slide, "（内容準備中）");
  }
}

async function buildPptxBuffer(
  parsed: ParsedDeliverable,
  options?: { aspectRatio?: AspectRatio },
): Promise<Buffer> {
  const pptx = new pptxgen();
  const aspect = options?.aspectRatio ?? "16:9";
  pptx.layout = aspect === "4:3" ? "LAYOUT_4x3" : "LAYOUT_16x9";
  pptx.author = "MINERVOT";
  pptx.title = jp(parsed.title);
  pptx.subject = "MINERVOT presentation";
  pptx.company = "MINERVOT";

  const titleSlide = pptx.addSlide();
  addSlideTitle(pptx, titleSlide, parsed.title, parsed.subtitle);
  titleSlide.addText(`MINERVOT · ${formatGeneratedDate()}`, {
    x: 0.6,
    y: 4.85,
    w: 8.8,
    h: 0.35,
    fontSize: 11,
    color: TEXT_MUTED,
    align: "center",
    fontFace: fontFace(),
  });
  titleSlide.addNotes(`タイトル: ${parsed.title}`);

  const agendaSlide = pptx.addSlide();
  addContentHeading(pptx, agendaSlide, ui.generated.agenda);
  addBodyBullets(
    agendaSlide,
    parsed.sections.map((s) => s.title),
    { fontSize: 18 },
  );
  agendaSlide.addNotes("アジェンダ");

  const chartCounter = { n: 0 };
  for (const section of parsed.sections) {
    addSectionSlides(pptx, section, chartCounter);
  }

  const summarySlide = pptx.addSlide();
  addContentHeading(pptx, summarySlide, ui.generated.summary);
  const summaryPoints = extractSummaryPoints(parsed).map(jp);
  addBodyBullets(summarySlide, summaryPoints.slice(0, 6), { fontSize: 18 });
  summarySlide.addNotes("まとめ");

  const closingSlide = pptx.addSlide();
  addSectionDivider(pptx, closingSlide, ui.generated.thankYou);
  closingSlide.addText(jp(parsed.title), {
    x: 0.6,
    y: 3.5,
    w: 8.8,
    h: 0.5,
    fontSize: 14,
    color: "FFFFFF",
    align: "center",
    fontFace: fontFace(),
  });
  closingSlide.addNotes("クロージング");

  void FONT_FALLBACK;
  const output = await pptx.write({ outputType: "nodebuffer" });
  return Buffer.from(output as ArrayBufferLike);
}

/** Production PowerPoint (.pptx) generator using pptxgenjs. */
export class PptxDeliverableGenerator implements DeliverableGenerator {
  readonly format = "pptx" as const;

  async generate(
    content: string,
    baseFileName: string,
    options?: Record<string, unknown>,
  ): Promise<GeneratedDeliverableFile> {
    const aspectRatio =
      options?.aspectRatio === "4:3" ? ("4:3" as const) : ("16:9" as const);
    const parsed = parseDeliverableContent(content);
    const buffer = await buildPptxBuffer(parsed, { aspectRatio });
    assertPptxProductionOrThrow(buffer);
    return createDeliverableFile("pptx", baseFileName, buffer, false);
  }
}

/** @deprecated Use {@link PptxDeliverableGenerator}. */
export const PptxPlaceholderGenerator = PptxDeliverableGenerator;
