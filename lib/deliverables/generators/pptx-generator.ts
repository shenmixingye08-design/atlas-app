import "server-only";

import pptxgen from "pptxgenjs";

import { ui } from "@/lib/i18n";
import { resolveEmbeddedImage } from "../embedded-image";
import {
  extractSummaryPoints,
  parseDeliverableContent,
} from "../parse-content";
import type { ContentBlock, ParsedDeliverable, ParsedSection } from "../parse-content";
import type { DeliverableGenerator, GeneratedDeliverableFile } from "../types";

import { createDeliverableFile, formatGeneratedDate } from "./shared";

const ATLAS_BLUE = "1F4E79";
const ATLAS_LIGHT = "D9E2F3";
const TEXT_DARK = "222222";
const TEXT_MUTED = "666666";

/** pptxgenjs exposes ShapeType on instances, not the constructor. */
const SHAPE_TYPE = new pptxgen().ShapeType;

type PptxGenerateOptions = {
  brandColorHex?: string | null;
  companyName?: string | null;
  /** Optional logo/image data URL embedded on the title slide (P1-08). */
  logoDataUrl?: string | null;
  powerpoint?: {
    brandColorHex?: string | null;
    fontFace?: string | null;
    titleAlign?: "left" | "center" | "right" | null;
    logoDataUrl?: string | null;
  } | null;
};

function resolvePptxBrand(options?: PptxGenerateOptions): {
  brand: string;
  fontFace: string;
  titleAlign: "left" | "center" | "right";
} {
  const raw =
    options?.powerpoint?.brandColorHex ?? options?.brandColorHex ?? ATLAS_BLUE;
  const brand = raw.replace(/^#/, "").toUpperCase();
  return {
    brand: /^[0-9A-F]{6}$/.test(brand) ? brand : ATLAS_BLUE,
    fontFace: options?.powerpoint?.fontFace?.trim() || "Calibri",
    titleAlign: options?.powerpoint?.titleAlign ?? "center",
  };
}

type SlideTextOptions = {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  fontSize?: number;
  bold?: boolean;
  color?: string;
  align?: "left" | "center" | "right";
  bullet?: boolean;
  lineSpacing?: number;
  fontFace?: string;
};

function addSlideTitle(
  slide: pptxgen.Slide,
  title: string,
  subtitle: string | undefined,
  theme: { brand: string; fontFace: string; titleAlign: "left" | "center" | "right" },
): void {
  slide.addShape(SHAPE_TYPE.rect, {
    x: 0,
    y: 0,
    w: "100%",
    h: 0.12,
    fill: { color: theme.brand },
  });

  slide.addText(title, {
    x: 0.6,
    y: 1.8,
    w: 8.8,
    h: 1.2,
    fontSize: 36,
    bold: true,
    color: theme.brand,
    align: theme.titleAlign,
    fontFace: theme.fontFace,
  });

  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.6,
      y: 3.0,
      w: 8.8,
      h: 0.6,
      fontSize: 16,
      color: TEXT_MUTED,
      align: theme.titleAlign,
      fontFace: theme.fontFace,
    });
  }
}

function addSectionDivider(
  slide: pptxgen.Slide,
  title: string,
  theme: { brand: string; fontFace: string },
): void {
  slide.addShape(SHAPE_TYPE.rect, {
    x: 0,
    y: 0,
    w: "100%",
    h: "100%",
    fill: { color: theme.brand },
  });
  slide.addText(title, {
    x: 0.6,
    y: 2.3,
    w: 8.8,
    h: 1.0,
    fontSize: 34,
    bold: true,
    color: "FFFFFF",
    align: "center",
    fontFace: theme.fontFace,
  });
}

function addContentHeading(
  slide: pptxgen.Slide,
  title: string,
  theme: { brand: string; fontFace: string },
): void {
  slide.addText(title, {
    x: 0.6,
    y: 0.35,
    w: 8.8,
    h: 0.7,
    fontSize: 24,
    bold: true,
    color: theme.brand,
    fontFace: theme.fontFace,
  });
  slide.addShape(SHAPE_TYPE.line, {
    x: 0.6,
    y: 1.05,
    w: 8.8,
    h: 0,
    line: { color: ATLAS_LIGHT, width: 2 },
  });
}

function addBodyText(
  slide: pptxgen.Slide,
  text: string,
  options: SlideTextOptions = {},
): void {
  slide.addText(text, {
    x: options.x ?? 0.8,
    y: options.y ?? 1.3,
    w: options.w ?? 8.4,
    h: options.h ?? 4.5,
    fontSize: options.fontSize ?? 16,
    bold: options.bold,
    color: options.color ?? TEXT_DARK,
    align: options.align ?? "left",
    bullet: options.bullet,
    lineSpacing: options.lineSpacing ?? 22,
    fontFace: options.fontFace ?? "Calibri",
    valign: "top",
  });
}

function chunkText(text: string, maxLength = 900): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    const slicePoint = remaining.lastIndexOf("\n\n", maxLength);
    const splitAt = slicePoint > 200 ? slicePoint : maxLength;
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

function chunkBulletItems(items: string[], maxPerSlide = 6): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < items.length; i += maxPerSlide) {
    chunks.push(items.slice(i, i + maxPerSlide));
  }
  return chunks.length > 0 ? chunks : [[]];
}

function addRealTable(
  slide: pptxgen.Slide,
  headers: string[],
  rows: string[][],
  theme: { brand: string; fontFace: string },
): void {
  const colCount = Math.max(headers.length, 1);
  const colW = Array.from({ length: colCount }, () => 8.8 / colCount);
  const tableRows: pptxgen.TableRow[] = [
    headers.map((header) => ({
      text: header || " ",
      options: {
        bold: true,
        color: "FFFFFF",
        fill: { color: theme.brand },
        align: "center" as const,
        valign: "middle" as const,
      },
    })),
    ...rows.map((row) =>
      Array.from({ length: colCount }, (_, index) => ({
        text: row[index] || " ",
        options: {
          color: TEXT_DARK,
          align: "left" as const,
          valign: "middle" as const,
        },
      })),
    ),
  ];

  slide.addTable(tableRows, {
    x: 0.6,
    y: 1.25,
    w: 8.8,
    colW,
    border: [
      { pt: 0.5, color: "B0B0B0" },
      { pt: 0.5, color: "B0B0B0" },
      { pt: 0.5, color: "B0B0B0" },
      { pt: 0.5, color: "B0B0B0" },
    ],
    fontFace: theme.fontFace,
    fontSize: 12,
    color: TEXT_DARK,
  });
}

async function addRealImage(
  slide: pptxgen.Slide,
  block: Extract<ContentBlock, { type: "imagePlaceholder" }>,
  y = 1.3,
): Promise<void> {
  const image = await resolveEmbeddedImage({
    dataUrl: block.dataUrl,
    caption: block.caption,
    marker: "P108IMG",
  });
  slide.addImage({
    data: image.pptxData,
    x: 1.4,
    y,
    w: 7.2,
    h: 3.2,
  });
  slide.addText(block.caption, {
    x: 1.2,
    y: y + 3.3,
    w: 7.6,
    h: 0.35,
    fontSize: 12,
    color: TEXT_MUTED,
    align: "center",
    fontFace: "Calibri",
  });
}

function flushTextSlide(
  pptx: pptxgen,
  title: string,
  body: string,
  theme: { brand: string; fontFace: string; titleAlign: "left" | "center" | "right" },
  options?: { bullet?: boolean },
): void {
  const chunks = chunkText(body);
  chunks.forEach((chunk, index) => {
    const slide = pptx.addSlide();
    addContentHeading(
      slide,
      index === 0 ? title : `${title} (cont.)`,
      theme,
    );
    addBodyText(slide, chunk || " ", {
      y: 1.35,
      lineSpacing: 24,
      bullet: options?.bullet,
      fontFace: theme.fontFace,
    });
  });
}

async function addSectionSlides(
  pptx: pptxgen,
  section: ParsedSection,
  theme: { brand: string; fontFace: string; titleAlign: "left" | "center" | "right" },
): Promise<{ tables: number; images: number }> {
  const divider = pptx.addSlide();
  addSectionDivider(divider, section.title, theme);

  let tables = 0;
  let images = 0;
  let pendingText: string[] = [];

  const flushPending = (titleSuffix = "") => {
    if (pendingText.length === 0) return;
    flushTextSlide(
      pptx,
      titleSuffix ? `${section.title}${titleSuffix}` : section.title,
      pendingText.join("\n\n"),
      theme,
    );
    pendingText = [];
  };

  for (const block of section.blocks) {
    switch (block.type) {
      case "paragraph":
        pendingText.push(block.text);
        break;
      case "bulletList": {
        flushPending();
        const bulletChunks = chunkBulletItems(block.items);
        bulletChunks.forEach((items, index) => {
          const slide = pptx.addSlide();
          addContentHeading(
            slide,
            index === 0
              ? `${section.title} — Key points`
              : `${section.title} — Key points (cont.)`,
            theme,
          );
          addBodyText(slide, items.join("\n"), {
            y: 1.4,
            bullet: true,
            fontSize: 17,
            lineSpacing: 26,
            fontFace: theme.fontFace,
          });
        });
        break;
      }
      case "numberedList":
        pendingText.push(
          ...block.items.map((item, index) => `${index + 1}. ${item}`),
        );
        break;
      case "table": {
        flushPending();
        const slide = pptx.addSlide();
        addContentHeading(slide, section.title, theme);
        addRealTable(slide, block.headers, block.rows, theme);
        tables += 1;
        break;
      }
      case "imagePlaceholder": {
        flushPending();
        const slide = pptx.addSlide();
        addContentHeading(slide, section.title, theme);
        await addRealImage(slide, block);
        images += 1;
        break;
      }
    }
  }

  flushPending();
  return { tables, images };
}

async function buildPptxBuffer(
  parsed: ParsedDeliverable,
  options?: PptxGenerateOptions,
): Promise<{ buffer: Buffer; tables: number; images: number }> {
  const pptx = new pptxgen();
  const theme = resolvePptxBrand(options);

  pptx.layout = "LAYOUT_16x9";
  pptx.author = options?.companyName ?? "Atlas";
  pptx.title = parsed.title;
  pptx.subject = ui.generated.engine;

  const titleSlide = pptx.addSlide();
  addSlideTitle(titleSlide, parsed.title, parsed.subtitle, theme);
  titleSlide.addText(`Generated by Atlas · ${formatGeneratedDate()}`, {
    x: 0.6,
    y: 4.8,
    w: 8.8,
    h: 0.4,
    fontSize: 12,
    color: TEXT_MUTED,
    align: "center",
    fontFace: theme.fontFace,
  });

  const logoDataUrl =
    options?.powerpoint?.logoDataUrl ?? options?.logoDataUrl ?? null;
  if (logoDataUrl) {
    const logo = await resolveEmbeddedImage({
      dataUrl: logoDataUrl,
      caption: "logo",
    });
    titleSlide.addImage({
      data: logo.pptxData,
      x: 8.6,
      y: 0.25,
      w: 0.9,
      h: 0.9,
    });
  }

  const agendaSlide = pptx.addSlide();
  addContentHeading(agendaSlide, ui.generated.agenda, theme);
  addBodyText(
    agendaSlide,
    parsed.sections.map((section) => section.title).join("\n"),
    { y: 1.4, bullet: true, fontSize: 18, fontFace: theme.fontFace },
  );

  let tables = 0;
  let images = 0;
  for (const section of parsed.sections) {
    const stats = await addSectionSlides(pptx, section, theme);
    tables += stats.tables;
    images += stats.images;
  }

  const summarySlide = pptx.addSlide();
  addContentHeading(summarySlide, ui.generated.summary, theme);
  const summaryPoints = extractSummaryPoints(parsed);
  const summaryChunks = chunkBulletItems(summaryPoints, 5);
  addBodyText(
    summarySlide,
    summaryChunks[0]?.join("\n") ?? " ",
    { y: 1.4, bullet: true, fontSize: 18, lineSpacing: 26, fontFace: theme.fontFace },
  );

  if (summaryChunks.length > 1) {
    for (let i = 1; i < summaryChunks.length; i += 1) {
      const slide = pptx.addSlide();
      addContentHeading(slide, ui.generated.summaryCont, theme);
      addBodyText(slide, summaryChunks[i]!.join("\n"), {
        y: 1.4,
        bullet: true,
        fontSize: 18,
        fontFace: theme.fontFace,
      });
    }
  }

  const closingSlide = pptx.addSlide();
  addSectionDivider(closingSlide, ui.generated.thankYou, theme);
  closingSlide.addText(parsed.title, {
    x: 0.6,
    y: 3.5,
    w: 8.8,
    h: 0.5,
    fontSize: 14,
    color: "FFFFFF",
    align: "center",
    fontFace: theme.fontFace,
  });

  const output = await pptx.write({ outputType: "nodebuffer" });
  return { buffer: Buffer.from(output as ArrayBuffer), tables, images };
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

/** Production PowerPoint (.pptx) generator using pptxgenjs. */
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
    // P1-08 fail-closed: never silently drop tables/images.
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
