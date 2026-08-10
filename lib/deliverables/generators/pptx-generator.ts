import "server-only";

import pptxgen from "pptxgenjs";

import { ui } from "@/lib/i18n";
import { resolveEmbeddedImage } from "../embedded-image";
import {
  extractSummaryPoints,
  parseDeliverableContent,
} from "../parse-content";
import type { ContentBlock, ParsedDeliverable, ParsedSection } from "../parse-content";
import {
  contentBodyOrigin,
  paintContentHeading,
  paintSectionDivider,
  paintTitleSlide,
} from "../pptx-templates/layouts";
import {
  injectPptxThemeAccent,
  resolvePptxDesign,
  type ResolvedPptxDesign,
} from "../pptx-templates";
import type { DeliverableGenerator, GeneratedDeliverableFile } from "../types";

import { createDeliverableFile, formatGeneratedDate } from "./shared";

type PptxGenerateOptions = {
  brandColorHex?: string | null;
  companyName?: string | null;
  assignment?: string | null;
  title?: string | null;
  /** Optional logo/image data URL embedded on the title slide (P1-08). */
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

function addBodyText(
  slide: pptxgen.Slide,
  text: string,
  design: ResolvedPptxDesign,
  options: {
    x?: number;
    y?: number;
    w?: number;
    h?: number;
    fontSize?: number;
    bold?: boolean;
    bullet?: boolean;
    lineSpacing?: number;
    align?: "left" | "center" | "right";
    color?: string;
  } = {},
): void {
  const origin = contentBodyOrigin(design);
  slide.addText(text, {
    x: options.x ?? origin.x,
    y: options.y ?? origin.y,
    w: options.w ?? origin.w,
    h: options.h ?? 4.5,
    fontSize: options.fontSize ?? design.template.bodyFontSize,
    bold: options.bold,
    color: options.color ?? design.colors.text,
    align: options.align ?? "left",
    bullet: options.bullet,
    lineSpacing: options.lineSpacing ?? 22,
    fontFace: design.fontFace,
    valign: "top",
  });
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
        text: row[index] || " ",
        options: {
          color: design.colors.text,
          align: "left" as const,
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
    fontSize: 12,
    color: design.colors.text,
  });
}

async function addRealImage(
  slide: pptxgen.Slide,
  block: Extract<ContentBlock, { type: "imagePlaceholder" }>,
  design: ResolvedPptxDesign,
  y?: number,
): Promise<void> {
  const origin = contentBodyOrigin(design);
  const image = await resolveEmbeddedImage({
    dataUrl: block.dataUrl,
    caption: block.caption,
    marker: "P108IMG",
  });
  const top = y ?? origin.y;
  slide.addImage({
    data: image.pptxData,
    x: origin.x + 0.6,
    y: top,
    w: Math.min(7.2, origin.w - 1.2),
    h: 3.2,
  });
  slide.addText(block.caption, {
    x: origin.x,
    y: top + 3.3,
    w: origin.w,
    h: 0.35,
    fontSize: 12,
    color: design.colors.muted,
    align: "center",
    fontFace: design.fontFace,
  });
}

function flushTextSlide(
  pptx: pptxgen,
  title: string,
  body: string,
  design: ResolvedPptxDesign,
  options?: { bullet?: boolean },
): number {
  const chunks = chunkText(body);
  chunks.forEach((chunk, index) => {
    const slide = pptx.addSlide();
    paintContentHeading(
      pptx,
      slide,
      index === 0 ? title : `${title} (cont.)`,
      design,
    );
    addBodyText(slide, chunk || " ", design, {
      y: contentBodyOrigin(design).y + 0.05,
      lineSpacing: 24,
      bullet: options?.bullet,
    });
  });
  return chunks.length;
}

async function addSectionSlides(
  pptx: pptxgen,
  section: ParsedSection,
  design: ResolvedPptxDesign,
  includeDivider: boolean,
): Promise<{ tables: number; images: number; slides: number }> {
  let slides = 0;
  if (includeDivider && design.template.showSectionDividers) {
    const divider = pptx.addSlide();
    paintSectionDivider(pptx, divider, section.title, design);
    slides += 1;
  }

  let tables = 0;
  let images = 0;
  let pendingText: string[] = [];

  const flushPending = (titleSuffix = "") => {
    if (pendingText.length === 0) return;
    slides += flushTextSlide(
      pptx,
      titleSuffix ? `${section.title}${titleSuffix}` : section.title,
      pendingText.join("\n\n"),
      design,
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
          paintContentHeading(
            pptx,
            slide,
            index === 0
              ? `${section.title} — Key points`
              : `${section.title} — Key points (cont.)`,
            design,
          );
          addBodyText(slide, items.join("\n"), design, {
            y: contentBodyOrigin(design).y + 0.1,
            bullet: true,
            fontSize: design.template.bodyFontSize + 1,
            lineSpacing: 26,
          });
          slides += 1;
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
        paintContentHeading(pptx, slide, section.title, design);
        addRealTable(slide, block.headers, block.rows, design);
        tables += 1;
        slides += 1;
        break;
      }
      case "imagePlaceholder": {
        flushPending();
        const slide = pptx.addSlide();
        paintContentHeading(pptx, slide, section.title, design);
        await addRealImage(slide, block, design);
        images += 1;
        slides += 1;
        break;
      }
    }
  }

  flushPending();
  return { tables, images, slides };
}

function shouldIncludeDividers(
  design: ResolvedPptxDesign,
  sectionCount: number,
): boolean {
  if (!design.template.showSectionDividers) return false;
  if (design.slideCountHint == null) return true;
  // Rough budget: title + optional agenda + sections*2 + summary + closing
  const estimate =
    1 +
    (design.template.showAgenda ? 1 : 0) +
    sectionCount * 2 +
    1 +
    (design.template.showClosing ? 1 : 0);
  return estimate <= design.slideCountHint + 2;
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

  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_16x9";
  pptx.author = design.companyName ?? "Atlas";
  pptx.title = parsed.title;
  pptx.subject = `${ui.generated.engine} · ${design.template.id}`;

  const titleSlide = pptx.addSlide();
  paintTitleSlide(pptx, titleSlide, parsed.title, parsed.subtitle, design);
  const footerColor =
    design.template.titleLayout === "full-bleed"
      ? design.colors.accentLight
      : design.colors.muted;
  titleSlide.addText(`Generated by Atlas · ${formatGeneratedDate()}`, {
    x: 0.6,
    y: 4.8,
    w: 8.8,
    h: 0.4,
    fontSize: 12,
    color: footerColor,
    align: "center",
    fontFace: design.fontFace,
  });

  if (design.logoDataUrl) {
    const logo = await resolveEmbeddedImage({
      dataUrl: design.logoDataUrl,
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

  const includeDividers = shouldIncludeDividers(
    design,
    parsed.sections.length,
  );

  if (design.template.showAgenda) {
    const agendaSlide = pptx.addSlide();
    paintContentHeading(pptx, agendaSlide, ui.generated.agenda, design);
    addBodyText(
      agendaSlide,
      parsed.sections.map((section) => section.title).join("\n"),
      design,
      {
        y: contentBodyOrigin(design).y + 0.1,
        bullet: true,
        fontSize: design.template.bodyFontSize + 2,
      },
    );
  }

  let tables = 0;
  let images = 0;
  for (const section of parsed.sections) {
    const stats = await addSectionSlides(
      pptx,
      section,
      design,
      includeDividers,
    );
    tables += stats.tables;
    images += stats.images;
  }

  const summarySlide = pptx.addSlide();
  paintContentHeading(pptx, summarySlide, ui.generated.summary, design);
  const summaryPoints = extractSummaryPoints(parsed);
  const summaryChunks = chunkBulletItems(summaryPoints, 5);
  addBodyText(summarySlide, summaryChunks[0]?.join("\n") ?? " ", design, {
    y: contentBodyOrigin(design).y + 0.1,
    bullet: true,
    fontSize: design.template.bodyFontSize + 2,
    lineSpacing: 26,
  });

  if (summaryChunks.length > 1) {
    for (let i = 1; i < summaryChunks.length; i += 1) {
      const slide = pptx.addSlide();
      paintContentHeading(pptx, slide, ui.generated.summaryCont, design);
      addBodyText(slide, summaryChunks[i]!.join("\n"), design, {
        y: contentBodyOrigin(design).y + 0.1,
        bullet: true,
        fontSize: design.template.bodyFontSize + 2,
      });
    }
  }

  if (design.template.showClosing) {
    const closingSlide = pptx.addSlide();
    paintSectionDivider(pptx, closingSlide, ui.generated.thankYou, design);
    closingSlide.addText(parsed.title, {
      x: 0.6,
      y: 3.5,
      w: 8.8,
      h: 0.5,
      fontSize: 14,
      color:
        design.template.titleLayout === "left-stripe"
          ? design.colors.muted
          : design.colors.onAccent,
      align: "center",
      fontFace: design.fontFace,
    });
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
