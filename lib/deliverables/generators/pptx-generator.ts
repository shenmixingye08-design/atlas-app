import "server-only";

import pptxgen from "pptxgenjs";

import { ui } from "@/lib/i18n";
import {
  extractSummaryPoints,
  parseDeliverableContent,
} from "../parse-content";
import type { ContentBlock, ParsedDeliverable, ParsedSection } from "../parse-content";
import type { DeliverableGenerator, GeneratedDeliverableFile } from "../types";

import { MarkdownDeliverableGenerator } from "./markdown-generator";
import { createDeliverableFile, formatGeneratedDate } from "./shared";

const ATLAS_BLUE = "1F4E79";
const ATLAS_LIGHT = "D9E2F3";
const TEXT_DARK = "222222";
const TEXT_MUTED = "666666";

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

function addSlideTitle(
  slide: pptxgen.Slide,
  title: string,
  subtitle?: string,
): void {
  slide.addShape(pptxgen.ShapeType.rect, {
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
    fontFace: "Calibri",
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
      fontFace: "Calibri",
    });
  }
}

function addSectionDivider(slide: pptxgen.Slide, title: string): void {
  slide.addShape(pptxgen.ShapeType.rect, {
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
    fontFace: "Calibri",
  });
}

function addContentHeading(slide: pptxgen.Slide, title: string): void {
  slide.addText(title, {
    x: 0.6,
    y: 0.35,
    w: 8.8,
    h: 0.7,
    fontSize: 24,
    bold: true,
    color: ATLAS_BLUE,
    fontFace: "Calibri",
  });
  slide.addShape(pptxgen.ShapeType.line, {
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
    fontFace: "Calibri",
    valign: "top",
  });
}

function addImagePlaceholder(slide: pptxgen.Slide, caption: string, y = 2.0): void {
  slide.addShape(pptxgen.ShapeType.rect, {
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
    fontFace: "Calibri",
  });
  slide.addText(caption, {
    x: 1.2,
    y: y + 2.55,
    w: 7.6,
    h: 0.4,
    fontSize: 12,
    color: TEXT_MUTED,
    align: "center",
    fontFace: "Calibri",
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
        parts.push(
          [block.headers.join(" | "), ...block.rows.map((row) => row.join(" | "))].join(
            "\n",
          ),
        );
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

function addSectionSlides(pptx: pptxgen, section: ParsedSection): void {
  const divider = pptx.addSlide();
  addSectionDivider(divider, section.title);

  const textBlocks = section.blocks.filter(
    (block) => block.type !== "imagePlaceholder",
  );
  const imageBlocks = section.blocks.filter(
    (block) => block.type === "imagePlaceholder",
  );

  const body = blocksToSlideText(textBlocks);
  const chunks = chunkText(body);

  chunks.forEach((chunk, index) => {
    const slide = pptx.addSlide();
    addContentHeading(
      slide,
      index === 0 ? section.title : `${section.title} (cont.)`,
    );
    addBodyText(slide, chunk || " ", { y: 1.35, lineSpacing: 24 });
  });

  for (const block of section.blocks) {
    if (block.type === "bulletList") {
      const bulletChunks = chunkBulletItems(block.items);
      bulletChunks.forEach((items, index) => {
        const slide = pptx.addSlide();
        addContentHeading(
          slide,
          index === 0
            ? `${section.title} — Key points`
            : `${section.title} — Key points (cont.)`,
        );
        addBodyText(slide, items.join("\n"), {
          y: 1.4,
          bullet: true,
          fontSize: 17,
          lineSpacing: 26,
        });
      });
    }
  }

  for (const imageBlock of imageBlocks) {
    if (imageBlock.type !== "imagePlaceholder") continue;
    const slide = pptx.addSlide();
    addContentHeading(slide, section.title);
    addImagePlaceholder(slide, imageBlock.caption);
  }
}

async function buildPptxBuffer(parsed: ParsedDeliverable): Promise<Buffer> {
  const pptx = new pptxgen();

  pptx.layout = "LAYOUT_16x9";
  pptx.author = "Atlas";
  pptx.title = parsed.title;
  pptx.subject = ui.generated.engine;

  const titleSlide = pptx.addSlide();
  addSlideTitle(titleSlide, parsed.title, parsed.subtitle);
  titleSlide.addText(`Generated by Atlas · ${formatGeneratedDate()}`, {
    x: 0.6,
    y: 4.8,
    w: 8.8,
    h: 0.4,
    fontSize: 12,
    color: TEXT_MUTED,
    align: "center",
    fontFace: "Calibri",
  });

  const agendaSlide = pptx.addSlide();
  addContentHeading(agendaSlide, ui.generated.agenda);
  addBodyText(
    agendaSlide,
    parsed.sections.map((section) => section.title).join("\n"),
    { y: 1.4, bullet: true, fontSize: 18 },
  );

  for (const section of parsed.sections) {
    addSectionSlides(pptx, section);
  }

  const summarySlide = pptx.addSlide();
  addContentHeading(summarySlide, ui.generated.summary);
  const summaryPoints = extractSummaryPoints(parsed);
  const summaryChunks = chunkBulletItems(summaryPoints, 5);
  addBodyText(
    summarySlide,
    summaryChunks[0]?.join("\n") ?? " ",
    { y: 1.4, bullet: true, fontSize: 18, lineSpacing: 26 },
  );

  if (summaryChunks.length > 1) {
    for (let i = 1; i < summaryChunks.length; i += 1) {
      const slide = pptx.addSlide();
      addContentHeading(slide, ui.generated.summaryCont);
      addBodyText(slide, summaryChunks[i]!.join("\n"), {
        y: 1.4,
        bullet: true,
        fontSize: 18,
      });
    }
  }

  const closingSlide = pptx.addSlide();
  addSectionDivider(closingSlide, ui.generated.thankYou);
  closingSlide.addText(parsed.title, {
    x: 0.6,
    y: 3.5,
    w: 8.8,
    h: 0.5,
    fontSize: 14,
    color: "FFFFFF",
    align: "center",
    fontFace: "Calibri",
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
