import "server-only";

import pptxgen from "pptxgenjs";

import { ui } from "@/lib/i18n";
import {
  extractSummaryPoints,
  parseDeliverableContent,
} from "../parse-content";
import type { ContentBlock, ParsedDeliverable } from "../parse-content";
import type { DeliverableGenerator, GeneratedDeliverableFile } from "../types";

import { MarkdownDeliverableGenerator } from "./markdown-generator";
import { createDeliverableFile, formatGeneratedDate } from "./shared";

const ATLAS_BLUE = "1F4E79";
const ATLAS_LIGHT = "D9E2F3";
const TEXT_DARK = "222222";
const TEXT_MUTED = "666666";
const FONT_FACE = "Yu Gothic";

/** pptxgenjs exposes ShapeType on instances; keep string fallbacks for ESM interop. */
function shape(
  pptx: pptxgen,
  name: "rect" | "ellipse" | "line",
): pptxgen.ShapeType {
  return (pptx.ShapeType?.[name] ?? name) as pptxgen.ShapeType;
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
};

function addPageNumber(slide: pptxgen.Slide, page: number, total: number): void {
  slide.addText(`${page} / ${total}`, {
    x: 8.2,
    y: 5.15,
    w: 1.4,
    h: 0.3,
    fontSize: 10,
    color: TEXT_MUTED,
    align: "right",
    fontFace: FONT_FACE,
  });
}

function addIconBadge(
  pptx: pptxgen,
  slide: pptxgen.Slide,
  label: string,
  x = 0.6,
  y = 1.25,
): void {
  slide.addShape(shape(pptx, "ellipse"), {
    x,
    y,
    w: 0.42,
    h: 0.42,
    fill: { color: ATLAS_BLUE },
  });
  slide.addText(label.slice(0, 1).toUpperCase(), {
    x,
    y: y + 0.05,
    w: 0.42,
    h: 0.32,
    fontSize: 12,
    bold: true,
    color: "FFFFFF",
    align: "center",
    fontFace: FONT_FACE,
  });
}

function addSlideTitle(
  pptx: pptxgen,
  slide: pptxgen.Slide,
  title: string,
  subtitle?: string,
): void {
  slide.addShape(shape(pptx, "rect"), {
    x: 0,
    y: 0,
    w: "100%",
    h: 0.12,
    fill: { color: ATLAS_BLUE },
  });

  slide.addText(title, {
    x: 0.6,
    y: 1.8,
    w: 8.8,
    h: 1.2,
    fontSize: 36,
    bold: true,
    color: ATLAS_BLUE,
    align: "center",
    fontFace: FONT_FACE,
  });

  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.6,
      y: 3.0,
      w: 8.8,
      h: 0.6,
      fontSize: 16,
      color: TEXT_MUTED,
      align: "center",
      fontFace: FONT_FACE,
    });
  }
}

function addSectionDivider(
  pptx: pptxgen,
  slide: pptxgen.Slide,
  title: string,
): void {
  slide.addShape(shape(pptx, "rect"), {
    x: 0,
    y: 0,
    w: "100%",
    h: "100%",
    fill: { color: ATLAS_BLUE },
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
    fontFace: FONT_FACE,
  });
}

function addContentHeading(
  pptx: pptxgen,
  slide: pptxgen.Slide,
  title: string,
): void {
  slide.addText(title, {
    x: 0.6,
    y: 0.35,
    w: 8.8,
    h: 0.7,
    fontSize: 24,
    bold: true,
    color: ATLAS_BLUE,
    fontFace: FONT_FACE,
  });
  slide.addShape(shape(pptx, "line"), {
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
    h: options.h ?? 3.6,
    fontSize: options.fontSize ?? 16,
    bold: options.bold,
    color: options.color ?? TEXT_DARK,
    align: options.align ?? "left",
    bullet: options.bullet,
    lineSpacing: options.lineSpacing ?? 22,
    fontFace: FONT_FACE,
    valign: "top",
  });
}

function addImagePlaceholder(
  pptx: pptxgen,
  slide: pptxgen.Slide,
  caption: string,
  y = 2.0,
): void {
  slide.addShape(shape(pptx, "rect"), {
    x: 1.2,
    y,
    w: 7.6,
    h: 2.4,
    fill: { color: "F2F2F2" },
    line: { color: "CCCCCC", width: 1 },
  });
  slide.addText(`[ ${ui.generated.imagePlaceholder} ]`, {
    x: 1.2,
    y: y + 0.85,
    w: 7.6,
    h: 0.5,
    fontSize: 14,
    color: "888888",
    align: "center",
    fontFace: FONT_FACE,
  });
  slide.addText(caption, {
    x: 1.2,
    y: y + 2.55,
    w: 7.6,
    h: 0.4,
    fontSize: 12,
    color: TEXT_MUTED,
    align: "center",
    fontFace: FONT_FACE,
  });
}

function addTableSlide(
  pptx: pptxgen,
  slide: pptxgen.Slide,
  title: string,
  headers: string[],
  rows: string[][],
): void {
  addContentHeading(pptx, slide, title);
  const tableRows: pptxgen.TableRow[] = [
    headers.map((header) => ({
      text: header,
      options: {
        bold: true,
        color: "FFFFFF",
        fill: { color: ATLAS_BLUE },
        align: "center",
        fontFace: FONT_FACE,
        fontSize: 12,
      },
    })),
    ...rows.slice(0, 8).map((row) =>
      headers.map((_, index) => ({
        text: row[index] ?? "",
        options: {
          color: TEXT_DARK,
          fill: { color: "FFFFFF" },
          fontFace: FONT_FACE,
          fontSize: 11,
        },
      })),
    ),
  ];

  slide.addTable(tableRows, {
    x: 0.5,
    y: 1.3,
    w: 9.0,
    colW: headers.map(() => 9.0 / Math.max(headers.length, 1)),
    border: [
      { pt: 0.5, color: "B0B8C4" },
      { pt: 0.5, color: "B0B8C4" },
      { pt: 0.5, color: "B0B8C4" },
      { pt: 0.5, color: "B0B8C4" },
    ],
    fontFace: FONT_FACE,
  });
}

function blocksToSlideText(blocks: ContentBlock[]): string {
  const parts: string[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case "paragraph":
        parts.push(block.text);
        break;
      case "bulletList":
        parts.push(...block.items.map((item) => `• ${item}`));
        break;
      case "numberedList":
        parts.push(...block.items.map((item, index) => `${index + 1}. ${item}`));
        break;
      case "table":
        break;
      case "imagePlaceholder":
        parts.push(`[Image: ${block.caption}]`);
        break;
    }
  }

  return parts.join("\n\n");
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

async function buildPptxBuffer(parsed: ParsedDeliverable): Promise<Buffer> {
  const pptx = new pptxgen();

  pptx.layout = "LAYOUT_16x9";
  pptx.author = "MINERVOT";
  pptx.title = parsed.title;
  pptx.subject = ui.generated.engine;

  const slides: pptxgen.Slide[] = [];

  const titleSlide = pptx.addSlide();
  addSlideTitle(pptx, titleSlide, parsed.title, parsed.subtitle);
  titleSlide.addText(`Generated by MINERVOT · ${formatGeneratedDate()}`, {
    x: 0.6,
    y: 4.8,
    w: 8.8,
    h: 0.4,
    fontSize: 12,
    color: TEXT_MUTED,
    align: "center",
    fontFace: FONT_FACE,
  });
  slides.push(titleSlide);

  const agendaSlide = pptx.addSlide();
  addContentHeading(pptx, agendaSlide, ui.generated.agenda);
  addIconBadge(pptx, agendaSlide, "A");
  addBodyText(
    agendaSlide,
    parsed.sections.map((section) => section.title).join("\n"),
    { y: 1.8, bullet: true, fontSize: 18 },
  );
  slides.push(agendaSlide);

  for (const section of parsed.sections) {
    const divider = pptx.addSlide();
    addSectionDivider(pptx, divider, section.title);
    slides.push(divider);

    const textBlocks = section.blocks.filter(
      (block) => block.type !== "imagePlaceholder" && block.type !== "table",
    );
    const imageBlocks = section.blocks.filter(
      (block) => block.type === "imagePlaceholder",
    );
    const tableBlocks = section.blocks.filter(
      (block) => block.type === "table",
    );

    const body = blocksToSlideText(textBlocks);
    const chunks = chunkText(body);

    if (body.trim()) {
      chunks.forEach((chunk, index) => {
        const slide = pptx.addSlide();
        addContentHeading(
          pptx,
          slide,
          index === 0 ? section.title : `${section.title} (続き)`,
        );
        addIconBadge(pptx, slide, String(index + 1));
        addBodyText(slide, chunk || " ", { y: 1.85, lineSpacing: 24 });
        slides.push(slide);
      });
    }

    for (const block of section.blocks) {
      if (block.type !== "bulletList") continue;
      const bulletChunks = chunkBulletItems(block.items);
      bulletChunks.forEach((items, index) => {
        const slide = pptx.addSlide();
        addContentHeading(
          pptx,
          slide,
          index === 0
            ? `${section.title} — 要点`
            : `${section.title} — 要点 (続き)`,
        );
        addIconBadge(pptx, slide, "•");
        addBodyText(slide, items.join("\n"), {
          y: 1.85,
          bullet: true,
          fontSize: 17,
          lineSpacing: 26,
        });
        slides.push(slide);
      });
    }

    for (const table of tableBlocks) {
      if (table.type !== "table") continue;
      const slide = pptx.addSlide();
      addTableSlide(pptx, slide, section.title, table.headers, table.rows);
      slides.push(slide);
    }

    for (const imageBlock of imageBlocks) {
      if (imageBlock.type !== "imagePlaceholder") continue;
      const slide = pptx.addSlide();
      addContentHeading(pptx, slide, section.title);
      addImagePlaceholder(pptx, slide, imageBlock.caption);
      slides.push(slide);
    }
  }

  const summarySlide = pptx.addSlide();
  addContentHeading(pptx, summarySlide, ui.generated.summary);
  addIconBadge(pptx, summarySlide, "S");
  const summaryPoints = extractSummaryPoints(parsed);
  const summaryChunks = chunkBulletItems(summaryPoints, 5);
  addBodyText(
    summarySlide,
    summaryChunks[0]?.join("\n") ?? " ",
    { y: 1.85, bullet: true, fontSize: 18, lineSpacing: 26 },
  );
  slides.push(summarySlide);

  if (summaryChunks.length > 1) {
    for (let i = 1; i < summaryChunks.length; i += 1) {
      const slide = pptx.addSlide();
      addContentHeading(pptx, slide, ui.generated.summaryCont);
      addBodyText(slide, summaryChunks[i]!.join("\n"), {
        y: 1.4,
        bullet: true,
        fontSize: 18,
      });
      slides.push(slide);
    }
  }

  const closingSlide = pptx.addSlide();
  addSectionDivider(pptx, closingSlide, ui.generated.thankYou);
  closingSlide.addText(parsed.title, {
    x: 0.6,
    y: 3.5,
    w: 8.8,
    h: 0.5,
    fontSize: 14,
    color: "FFFFFF",
    align: "center",
    fontFace: FONT_FACE,
  });
  slides.push(closingSlide);

  const total = slides.length;
  slides.forEach((slide, index) => {
    if (index === 0 || index === total - 1) return;
    addPageNumber(slide, index + 1, total);
  });

  const output = await pptx.write({ outputType: "nodebuffer" });
  return Buffer.from(output as ArrayBuffer);
}

/** Production PowerPoint (.pptx) generator using pptxgenjs. */
export class PptxDeliverableGenerator implements DeliverableGenerator {
  readonly format = "pptx" as const;

  async generate(
    content: string,
    baseFileName: string,
  ): Promise<GeneratedDeliverableFile> {
    try {
      const parsed = parseDeliverableContent(content);
      const buffer = await buildPptxBuffer(parsed);
      return createDeliverableFile("pptx", baseFileName, buffer, false);
    } catch (error) {
      console.error("[PptxDeliverableGenerator] Falling back to Markdown:", error);
      return new MarkdownDeliverableGenerator().generate(content, baseFileName);
    }
  }
}

/** @deprecated Use {@link PptxDeliverableGenerator}. */
export const PptxPlaceholderGenerator = PptxDeliverableGenerator;
