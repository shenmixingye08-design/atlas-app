import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  PageBreak,
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
import {
  buildStructuredDocument,
  getDocumentTheme,
  type DesignTemplateId,
  type DocumentBlock,
  type DocumentTheme,
  type StructuredDocument,
} from "../document-model";
import type { DeliverableGenerator, GeneratedDeliverableFile } from "../types";

import { MarkdownDeliverableGenerator } from "./markdown-generator";
import { createDeliverableFile } from "./shared";

const FONT = "Yu Gothic";
const EAST_ASIA_FONT = "Yu Gothic";

export type DocxGenerateOptions = {
  assignment?: string;
  title?: string;
  designTemplate?: DesignTemplateId;
  authorLabel?: string;
};

function run(
  text: string,
  theme: DocumentTheme,
  options?: { bold?: boolean; size?: number; color?: string },
): TextRun {
  return new TextRun({
    text,
    font: { ascii: FONT, eastAsia: EAST_ASIA_FONT, hAnsi: FONT },
    size: options?.size ?? theme.bodySize,
    bold: options?.bold,
    color: options?.color ?? theme.textHex,
  });
}

function emptyParagraph(after = 120): Paragraph {
  return new Paragraph({ spacing: { after }, children: [] });
}

function paragraphBlock(text: string, theme: DocumentTheme): Paragraph {
  return new Paragraph({
    spacing: { after: 200, line: theme.lineSpacing },
    children: [run(text, theme)],
  });
}

function headingParagraph(
  text: string,
  level: 1 | 2 | 3,
  theme: DocumentTheme,
): Paragraph {
  const heading =
    level === 1
      ? HeadingLevel.HEADING_1
      : level === 2
        ? HeadingLevel.HEADING_2
        : HeadingLevel.HEADING_3;
  const size =
    level === 1 ? theme.h1Size : level === 2 ? theme.h2Size : theme.h3Size;
  return new Paragraph({
    heading,
    spacing: {
      before: level === 1 ? 360 : 280,
      after: 160,
      line: theme.lineSpacing,
    },
    border:
      level === 1
        ? {
            bottom: {
              color: theme.lineHex,
              space: 8,
              style: BorderStyle.SINGLE,
              size: 8,
            },
          }
        : undefined,
    children: [run(text, theme, { bold: true, size, color: theme.accentHex })],
  });
}

function bulletList(items: string[], theme: DocumentTheme): Paragraph[] {
  return items.map(
    (item) =>
      new Paragraph({
        spacing: { after: 80, line: theme.lineSpacing },
        bullet: { level: 0 },
        children: [run(item, theme)],
      }),
  );
}

function numberedList(items: string[], theme: DocumentTheme): Paragraph[] {
  return items.map(
    (item, index) =>
      new Paragraph({
        spacing: { after: 100, line: theme.lineSpacing },
        children: [run(`${index + 1}. ${item}`, theme)],
      }),
  );
}

function calloutBlock(
  variant: "note" | "important" | "warning",
  text: string,
  theme: DocumentTheme,
): Paragraph[] {
  const label =
    variant === "important" ? "重要" : variant === "warning" ? "注意" : "注記";
  return [
    new Paragraph({
      spacing: { before: 120, after: 160, line: theme.lineSpacing },
      shading: { fill: theme.calloutFillHex, type: ShadingType.CLEAR },
      border: {
        left: {
          color: theme.accentHex,
          space: 10,
          style: BorderStyle.SINGLE,
          size: 24,
        },
      },
      children: [
        run(`【${label}】`, theme, {
          bold: true,
          color: theme.accentHex,
          size: theme.bodySize,
        }),
        run(` ${text}`, theme),
      ],
    }),
  ];
}

function keyCardBlock(
  title: string,
  items: string[],
  theme: DocumentTheme,
): Array<Paragraph | Table> {
  const rows = items.map(
    (item) =>
      new TableRow({
        children: [
          new TableCell({
            width: { size: 100, type: WidthType.PERCENTAGE },
            shading: { fill: theme.calloutFillHex, type: ShadingType.CLEAR },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 4, color: theme.lineHex },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: theme.lineHex },
              left: { style: BorderStyle.SINGLE, size: 12, color: theme.accentHex },
              right: { style: BorderStyle.SINGLE, size: 4, color: theme.lineHex },
            },
            margins: { top: 80, bottom: 80, left: 140, right: 140 },
            children: [
              new Paragraph({
                spacing: { after: 0, line: theme.lineSpacing },
                children: [run(`・${item}`, theme)],
              }),
            ],
          }),
        ],
      }),
  );

  return [
    new Paragraph({
      spacing: { before: 120, after: 80 },
      children: [run(title, theme, { bold: true, color: theme.accentHex })],
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows,
    }),
    emptyParagraph(160),
  ];
}

function tableBlock(
  headers: string[],
  rows: string[][],
  theme: DocumentTheme,
): Array<Paragraph | Table> {
  const columnCount = Math.max(headers.length, 1);
  const width = Math.floor(100 / columnCount);

  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(
      (header) =>
        new TableCell({
          width: { size: width, type: WidthType.PERCENTAGE },
          shading: { fill: theme.headerFillHex, type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 100, right: 100 },
          children: [
            new Paragraph({
              spacing: { after: 0 },
              children: [
                run(header || " ", theme, { bold: true, color: "FFFFFF" }),
              ],
            }),
          ],
        }),
    ),
  });

  const bodyRows = rows.map((row, rowIndex) => {
    const zebra = rowIndex % 2 === 1 ? theme.zebraFillHex : "FFFFFF";
    return new TableRow({
      children: Array.from({ length: columnCount }, (_, columnIndex) => {
        const cell = (row[columnIndex] ?? "").trim() || "—";
        return new TableCell({
          width: { size: width, type: WidthType.PERCENTAGE },
          shading: { fill: zebra, type: ShadingType.CLEAR },
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          children: [
            new Paragraph({
              spacing: { after: 0, line: 260 },
              children: [run(cell, theme, { size: theme.bodySize - 1 })],
            }),
          ],
        });
      }),
    });
  });

  return [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...bodyRows],
    }),
    emptyParagraph(180),
  ];
}

function blocksToChildren(
  blocks: DocumentBlock[],
  theme: DocumentTheme,
): Array<Paragraph | Table> {
  const children: Array<Paragraph | Table> = [];
  for (const block of blocks) {
    switch (block.type) {
      case "paragraph":
        children.push(paragraphBlock(block.text, theme));
        break;
      case "bulletList":
        children.push(...bulletList(block.items, theme));
        children.push(emptyParagraph(80));
        break;
      case "numberedList":
        children.push(...numberedList(block.items, theme));
        children.push(emptyParagraph(80));
        break;
      case "table":
        children.push(...tableBlock(block.headers, block.rows, theme));
        break;
      case "callout":
        children.push(...calloutBlock(block.variant, block.text, theme));
        break;
      case "keyCard":
        children.push(...keyCardBlock(block.title, block.items, theme));
        break;
      case "imagePlaceholder":
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 160 },
            children: [
              run(`[${block.caption || ui.generated.imagePlaceholder}]`, theme, {
                color: theme.mutedHex,
              }),
            ],
          }),
        );
        break;
    }
  }
  return children;
}

function buildCover(doc: StructuredDocument, theme: DocumentTheme): Paragraph[] {
  const spacer = (before: number) =>
    new Paragraph({ spacing: { before, after: 0 }, children: [] });

  const lines: Paragraph[] = [
    spacer(theme.coverStyle === "minimal" ? 600 : 1200),
    new Paragraph({
      spacing: { after: 120 },
      children: [
        run(doc.meta.documentTypeLabel, theme, {
          size: 20,
          color: theme.accentHex,
          bold: true,
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 200 },
      border: {
        bottom: {
          color: theme.accentHex,
          space: 12,
          style: BorderStyle.SINGLE,
          size: 18,
        },
      },
      children: [
        run(doc.title, theme, {
          bold: true,
          size: theme.titleSize,
          color: theme.accentHex,
        }),
      ],
    }),
  ];

  if (doc.subtitle) {
    lines.push(
      new Paragraph({
        spacing: { before: 200, after: 400 },
        children: [
          run(doc.subtitle, theme, { size: 26, color: theme.mutedHex }),
        ],
      }),
    );
  }

  lines.push(
    new Paragraph({
      spacing: { before: 200, after: 80 },
      children: [
        run(`作成日：${doc.meta.createdAtLabel}`, theme, {
          size: 20,
          color: theme.mutedHex,
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 80 },
      children: [
        run(`作成：${doc.meta.authorLabel}`, theme, {
          size: 20,
          color: theme.mutedHex,
        }),
      ],
    }),
  );

  for (const field of doc.meta.fields) {
    lines.push(
      new Paragraph({
        spacing: { after: 60 },
        children: [
          run(`${field.label}：${field.value}`, theme, {
            size: 20,
            color: theme.mutedHex,
          }),
        ],
      }),
    );
  }

  lines.push(
    new Paragraph({
      children: [new PageBreak()],
    }),
  );

  return lines;
}

function buildBody(doc: StructuredDocument, theme: DocumentTheme): Array<Paragraph | Table> {
  const children: Array<Paragraph | Table> = [];

  if (doc.includeTableOfContents && theme.showToc) {
    children.push(
      headingParagraph(ui.generated.tableOfContents, 1, theme),
      new TableOfContents(ui.generated.contents, {
        hyperlink: true,
        headingStyleRange: "1-3",
      }),
      new Paragraph({ children: [new PageBreak()] }),
    );
  }

  for (const section of doc.sections) {
    if (section.pageBreakBefore) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }
    children.push(headingParagraph(section.title, section.level, theme));
    children.push(...blocksToChildren(section.blocks, theme));
  }

  return children;
}

function buildHeader(doc: StructuredDocument, theme: DocumentTheme): Header {
  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        border: {
          bottom: {
            color: theme.lineHex,
            space: 6,
            style: BorderStyle.SINGLE,
            size: 6,
          },
        },
        spacing: { after: 80 },
        children: [
          run(`${doc.title} ｜ ${doc.meta.documentTypeLabel}`, theme, {
            size: 16,
            color: theme.mutedHex,
          }),
        ],
      }),
    ],
  });
}

function buildFooter(theme: DocumentTheme): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        border: {
          top: {
            color: theme.lineHex,
            space: 6,
            style: BorderStyle.SINGLE,
            size: 6,
          },
        },
        spacing: { before: 80 },
        children: [
          run("MINERVOT  ", theme, { size: 16, color: theme.mutedHex }),
          run("—  ", theme, { size: 16, color: theme.mutedHex }),
          new TextRun({
            children: [PageNumber.CURRENT],
            font: { ascii: FONT, eastAsia: EAST_ASIA_FONT, hAnsi: FONT },
            size: 16,
            color: theme.mutedHex,
          }),
          run(" / ", theme, { size: 16, color: theme.mutedHex }),
          new TextRun({
            children: [PageNumber.TOTAL_PAGES],
            font: { ascii: FONT, eastAsia: EAST_ASIA_FONT, hAnsi: FONT },
            size: 16,
            color: theme.mutedHex,
          }),
        ],
      }),
    ],
  });
}

async function buildDocxBuffer(doc: StructuredDocument): Promise<Buffer> {
  const theme = getDocumentTheme(doc.designTemplate);

  const document = new Document({
    creator: doc.meta.authorLabel,
    title: doc.title,
    description: ui.generated.engine,
    styles: {
      default: {
        document: {
          run: {
            font: { ascii: FONT, eastAsia: EAST_ASIA_FONT, hAnsi: FONT },
            size: theme.bodySize,
            color: theme.textHex,
          },
          paragraph: {
            spacing: { line: theme.lineSpacing, after: 120 },
          },
        },
      },
      paragraphStyles: [
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          paragraph: {
            spacing: { before: 360, after: 160 },
            outlineLevel: 0,
          },
          run: {
            font: { ascii: FONT, eastAsia: EAST_ASIA_FONT, hAnsi: FONT },
            size: theme.h1Size,
            bold: true,
            color: theme.accentHex,
          },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          paragraph: {
            spacing: { before: 280, after: 140 },
            outlineLevel: 1,
          },
          run: {
            font: { ascii: FONT, eastAsia: EAST_ASIA_FONT, hAnsi: FONT },
            size: theme.h2Size,
            bold: true,
            color: theme.accentHex,
          },
        },
        {
          id: "Heading3",
          name: "Heading 3",
          basedOn: "Normal",
          next: "Normal",
          paragraph: {
            spacing: { before: 220, after: 120 },
            outlineLevel: 2,
          },
          run: {
            font: { ascii: FONT, eastAsia: EAST_ASIA_FONT, hAnsi: FONT },
            size: theme.h3Size,
            bold: true,
            color: theme.accentHex,
          },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: theme.marginDxa.top,
              right: theme.marginDxa.right,
              bottom: theme.marginDxa.bottom,
              left: theme.marginDxa.left,
            },
          },
        },
        headers: { default: buildHeader(doc, theme) },
        footers: { default: buildFooter(theme) },
        children: [...buildCover(doc, theme), ...buildBody(doc, theme)],
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(document));
}

/** Production Word (.docx) generator with document-type templates. */
export class DocxDeliverableGenerator implements DeliverableGenerator {
  readonly format = "docx" as const;

  async generate(
    content: string,
    baseFileName: string,
    options?: DocxGenerateOptions,
  ): Promise<GeneratedDeliverableFile> {
    try {
      const structured = buildStructuredDocument({
        content,
        assignment: options?.assignment,
        title: options?.title,
        designTemplate: options?.designTemplate,
        authorLabel: options?.authorLabel,
      });
      const buffer = await buildDocxBuffer(structured);
      return createDeliverableFile("docx", baseFileName, buffer, false);
    } catch (error) {
      console.error("[DocxDeliverableGenerator] Falling back to Markdown:", error);
      return new MarkdownDeliverableGenerator().generate(content, baseFileName);
    }
  }
}

/** @deprecated Use {@link DocxDeliverableGenerator}. */
export const DocxPlaceholderGenerator = DocxDeliverableGenerator;
