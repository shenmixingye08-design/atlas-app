import {
  AlignmentType,
  Document,
  Footer,
  HeadingLevel,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

import { ui } from "@/lib/i18n";
import { logDocxStage, logDocxStageFailure } from "../docx-stage-log";
import { parseDeliverableContent } from "../parse-content";
import type { ContentBlock, ParsedDeliverable } from "../parse-content";
import type { DeliverableGenerator, GeneratedDeliverableFile } from "../types";

import { createDeliverableFile } from "./shared";

const FONT = "Yu Gothic";
const EAST_ASIA_FONT = "Yu Gothic";
const BODY_SIZE = 22;
const H1_SIZE = 32;
const H2_SIZE = 28;
const H3_SIZE = 24;
const TITLE_SIZE = 44;
const SUBTITLE_SIZE = 26;
const CAPTION_SIZE = 18;
const ATLAS_BLUE = "1F4E79";

function bodyText(
  text: string,
  options?: { bold?: boolean; size?: number; color?: string },
): TextRun {
  return new TextRun({
    text,
    font: {
      ascii: FONT,
      eastAsia: EAST_ASIA_FONT,
      hAnsi: FONT,
    },
    size: options?.size ?? BODY_SIZE,
    bold: options?.bold,
    color: options?.color,
  });
}

function headingParagraph(
  text: string,
  level: (typeof HeadingLevel)[keyof typeof HeadingLevel],
  size: number,
): Paragraph {
  const spacingBefore = level === HeadingLevel.HEADING_1 ? 360 : level === HeadingLevel.HEADING_2 ? 280 : 200;
  return new Paragraph({
    heading: level,
    spacing: { before: spacingBefore, after: 140 },
    children: [bodyText(text, { bold: true, size, color: ATLAS_BLUE })],
  });
}

function paragraphBlock(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 180, line: 288 },
    children: [bodyText(text)],
  });
}

function bulletListBlock(items: string[]): Paragraph[] {
  return items.map(
    (item) =>
      new Paragraph({
        spacing: { after: 80 },
        bullet: { level: 0 },
        children: [bodyText(item)],
      }),
  );
}

function numberedListBlock(items: string[]): Paragraph[] {
  return items.map(
    (item, index) =>
      new Paragraph({
        spacing: { after: 80 },
        children: [bodyText(`${index + 1}. ${item}`)],
      }),
  );
}

function tableBlock(headers: string[], rows: string[][]): Table {
  const columnCount = Math.max(headers.length, 1);

  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(
      (header) =>
        new TableCell({
          width: { size: 100 / columnCount, type: WidthType.PERCENTAGE },
          shading: { fill: ATLAS_BLUE, type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [
            new Paragraph({
              spacing: { after: 0 },
              children: [bodyText(header, { bold: true, color: "FFFFFF" })],
            }),
          ],
        }),
    ),
  });

  const bodyRows = rows.map(
    (row, rowIndex) =>
      new TableRow({
        children: Array.from({ length: columnCount }, (_, columnIndex) => {
          const cell = row[columnIndex] ?? "";
          const zebra = rowIndex % 2 === 1 ? "F7F9FC" : "FFFFFF";
          return new TableCell({
            width: { size: 100 / columnCount, type: WidthType.PERCENTAGE },
            shading: { fill: zebra, type: ShadingType.CLEAR },
            margins: { top: 60, bottom: 60, left: 120, right: 120 },
            children: [
              new Paragraph({
                spacing: { after: 0, line: 260 },
                children: [bodyText(cell)],
              }),
            ],
          });
        }),
      }),
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...bodyRows],
  });
}

function imagePlaceholderBlock(caption: string): Paragraph[] {
  return [
    new Paragraph({
      spacing: { before: 160, after: 80 },
      shading: { fill: "F2F2F2", type: ShadingType.CLEAR },
      border: {
        top: { color: "CCCCCC", size: 6, style: "single" },
        bottom: { color: "CCCCCC", size: 6, style: "single" },
        left: { color: "CCCCCC", size: 6, style: "single" },
        right: { color: "CCCCCC", size: 6, style: "single" },
      },
      alignment: AlignmentType.CENTER,
      children: [
        bodyText(`[ ${ui.generated.imagePlaceholder} ]`, { color: "888888", bold: true }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
      children: [bodyText(caption, { size: CAPTION_SIZE, color: "666666" })],
    }),
  ];
}

function blocksToDocxChildren(blocks: ContentBlock[]): Array<Paragraph | Table> {
  const children: Array<Paragraph | Table> = [];

  for (const block of blocks) {
    switch (block.type) {
      case "paragraph":
        children.push(paragraphBlock(block.text));
        break;
      case "bulletList":
        children.push(...bulletListBlock(block.items));
        break;
      case "numberedList":
        children.push(...numberedListBlock(block.items));
        break;
      case "table":
        children.push(tableBlock(block.headers, block.rows));
        children.push(new Paragraph({ spacing: { after: 160 }, children: [] }));
        break;
      case "imagePlaceholder":
        children.push(...imagePlaceholderBlock(block.caption));
        break;
    }
  }

  return children;
}

function buildTitlePage(parsed: ParsedDeliverable): Paragraph[] {
  return [
    new Paragraph({
      spacing: { before: 400, after: 200 },
      children: [
        bodyText(parsed.title, { bold: true, size: TITLE_SIZE, color: ATLAS_BLUE }),
      ],
    }),
    ...(parsed.subtitle
      ? [
          new Paragraph({
            spacing: { after: 300 },
            children: [
              bodyText(parsed.subtitle, { size: SUBTITLE_SIZE, color: "444444" }),
            ],
          }),
        ]
      : []),
  ];
}

function buildSectionChildren(parsed: ParsedDeliverable): Array<Paragraph | Table> {
  const children: Array<Paragraph | Table> = [];

  if (parsed.includeTableOfContents) {
    children.push(
      new Paragraph({
        spacing: { after: 200 },
        children: [bodyText(ui.generated.tableOfContents, { bold: true, size: H2_SIZE })],
      }),
      new TableOfContents(ui.generated.contents, {
        hyperlink: true,
        headingStyleRange: "1-3",
      }),
    );
  }

  for (const section of parsed.sections) {
    const headingLevel =
      section.level === 1
        ? HeadingLevel.HEADING_1
        : section.level === 2
          ? HeadingLevel.HEADING_2
          : HeadingLevel.HEADING_3;

    const headingSize =
      section.level === 1 ? H1_SIZE : section.level === 2 ? H2_SIZE : H3_SIZE;

    children.push(headingParagraph(section.title, headingLevel, headingSize));
    children.push(...blocksToDocxChildren(section.blocks));
  }

  return children;
}

function buildFooter(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          bodyText("Atlas · Page ", { size: CAPTION_SIZE, color: "666666" }),
          new TextRun({
            children: ["", PageNumber.CURRENT],
            font: {
              ascii: FONT,
              eastAsia: EAST_ASIA_FONT,
              hAnsi: FONT,
            },
            size: CAPTION_SIZE,
            color: "666666",
          }),
        ],
      }),
    ],
  });
}

async function buildDocxBuffer(parsed: ParsedDeliverable): Promise<Buffer> {
  const doc = new Document({
    creator: "Atlas",
    title: parsed.title,
    description: ui.generated.engine,
    styles: {
      default: {
        document: {
          run: {
            font: {
              ascii: FONT,
              eastAsia: EAST_ASIA_FONT,
              hAnsi: FONT,
            },
            size: BODY_SIZE,
          },
          paragraph: {
            spacing: { line: 276 },
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        footers: {
          default: buildFooter(),
        },
        children: [...buildTitlePage(parsed), ...buildSectionChildren(parsed)],
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

/** Production Word (.docx) generator using the `docx` library. */
export class DocxDeliverableGenerator implements DeliverableGenerator {
  readonly format = "docx" as const;

  async generate(
    content: string,
    baseFileName: string,
  ): Promise<GeneratedDeliverableFile> {
    // Never silent-fallback to Markdown — Word success must mean a real .docx.
    try {
      logDocxStage("DOCX_PARSE_STARTED", {}, { baseFileName });
      const parsed = parseDeliverableContent(content);
      logDocxStage("DOCX_PARSE_COMPLETED", {}, {
        baseFileName,
        sectionCount: parsed.sections.length,
        title: parsed.title,
      });

      logDocxStage("DOCX_PACK_STARTED", {}, { baseFileName });
      const buffer = await buildDocxBuffer(parsed);
      logDocxStage("DOCX_PACK_COMPLETED", {}, {
        baseFileName,
        sizeBytes: buffer.byteLength,
      });

      // Refuse mid-pipeline / text / XML dumps — completed OOXML zip only.
      if (
        buffer.byteLength < 1_500 ||
        buffer[0] !== 0x50 ||
        buffer[1] !== 0x4b
      ) {
        throw new Error("Word生成失敗: Packer output is not a completed .docx zip");
      }
      const head = buffer.subarray(0, 64).toString("utf8");
      if (
        head.includes('"type":') ||
        head.includes("<!DOCTYPE") ||
        head.trimStart().startsWith("{")
      ) {
        throw new Error("Word生成失敗: refused JSON/HTML payload");
      }
      return createDeliverableFile("docx", baseFileName, buffer, false);
    } catch (error) {
      logDocxStageFailure("DOCX_PACK_STARTED", error, {}, { baseFileName });
      throw error;
    }
  }
}

/** @deprecated Use {@link DocxDeliverableGenerator}. */
export const DocxPlaceholderGenerator = DocxDeliverableGenerator;
