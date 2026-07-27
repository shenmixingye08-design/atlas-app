import {
  AlignmentType,
  Document,
  Footer,
  Header,
  HeadingLevel,
  PageNumber,
  Packer,
  PageBreak,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
  BorderStyle,
  convertInchesToTwip,
} from "docx";

import type { DocumentModel, DocumentModelBlock } from "../document-model/document-model-schema";
import { formatGeneratedDate } from "./shared";
import {
  formatCompanyLetterhead,
  type WordCompanyBrand,
} from "../company-brand";
import {
  getWordTemplate,
  type WordTemplateDefinition,
  type WordTemplateId,
} from "../word-templates";

/** Font fallback chain documented for environments without Yu Gothic. */
export const WORD_FONT_FALLBACKS = [
  "Yu Gothic",
  "Meiryo",
  "Noto Sans CJK JP",
  "MS Gothic",
  "sans-serif",
] as const;

const CAPTION_SIZE = 18;

function resolveFonts(template: WordTemplateDefinition, brand: WordCompanyBrand | null) {
  const eastAsia =
    brand?.defaultFont?.trim() || template.typography.eastAsiaFont || "Yu Gothic";
  const ascii = template.typography.asciiFont || "Calibri";
  return { eastAsia, ascii };
}

function run(
  text: string,
  template: WordTemplateDefinition,
  brand: WordCompanyBrand | null,
  options?: { bold?: boolean; size?: number; color?: string },
): TextRun {
  const fonts = resolveFonts(template, brand);
  return new TextRun({
    text,
    font: {
      ascii: fonts.ascii,
      eastAsia: fonts.eastAsia,
      hAnsi: fonts.ascii,
    },
    size: options?.size ?? template.typography.bodyHalfPoints,
    bold: options?.bold,
    color: options?.color ?? template.colors.textHex,
  });
}

function formatDate(template: WordTemplateDefinition, value?: string): string {
  if (value?.trim()) return value.trim();
  if (template.dateFormat === "iso") {
    return new Date().toISOString().slice(0, 10);
  }
  if (template.dateFormat === "ja-slash") {
    const now = new Date();
    return `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`;
  }
  return formatGeneratedDate();
}

function isNumericCell(value: string): boolean {
  const cleaned = value.replace(/[,，\s円¥￥]/g, "");
  return /^-?\d+(\.\d+)?%?$/.test(cleaned);
}

function isDateCell(value: string): boolean {
  return (
    /^\d{4}[/-年]\d{1,2}[/-月]\d{1,2}/.test(value.trim()) ||
    /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(value.trim())
  );
}

function isCurrencyCell(value: string): boolean {
  return /[円¥￥]/.test(value) || /^-?[\d,，]+(\.\d+)?円$/.test(value.trim());
}

function cellAlignment(value: string): (typeof AlignmentType)[keyof typeof AlignmentType] {
  if (isCurrencyCell(value) || isNumericCell(value)) return AlignmentType.RIGHT;
  if (isDateCell(value)) return AlignmentType.CENTER;
  return AlignmentType.LEFT;
}

function computeColumnWidths(
  headers: string[],
  rows: string[][],
  totalDxa: number,
): number[] {
  const columnCount = headers.length;
  const weights = headers.map((header, index) => {
    const maxLen = Math.max(
      header.length,
      ...rows.map((row) => (row[index] ?? "").length),
      1,
    );
    return Math.min(40, Math.max(6, maxLen));
  });
  const sum = weights.reduce((a, b) => a + b, 0) || columnCount;
  const widths = weights.map((w) => Math.floor((totalDxa * w) / sum));
  // Fix rounding remainder
  const used = widths.reduce((a, b) => a + b, 0);
  if (widths.length > 0) {
    widths[widths.length - 1]! += totalDxa - used;
  }
  return widths;
}

function buildTable(
  headers: string[],
  rows: string[][],
  template: WordTemplateDefinition,
  brand: WordCompanyBrand | null,
  options?: { landscape?: boolean },
): Table {
  const accent = brand?.brandColorHex || template.colors.headerFillHex;
  const usableDxa =
    (options?.landscape ? 16840 : 11906) -
    template.marginsDxa.left -
    template.marginsDxa.right;
  const widths = computeColumnWidths(headers, rows, Math.max(usableDxa, 3000));
  const border = {
    style: BorderStyle.SINGLE,
    size: 4,
    color: template.colors.lineHex,
  };

  const headerRow = new TableRow({
    tableHeader: template.tableHeaderRepeat,
    children: headers.map(
      (header, index) =>
        new TableCell({
          width: { size: widths[index] ?? 1000, type: WidthType.DXA },
          shading: { fill: accent, type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 100, right: 100 },
          borders: { top: border, bottom: border, left: border, right: border },
          children: [
            new Paragraph({
              spacing: { after: 0 },
              children: [
                run(header || " ", template, brand, {
                  bold: true,
                  color: "FFFFFF",
                  size: template.typography.bodyHalfPoints - 2,
                }),
              ],
            }),
          ],
        }),
    ),
  });

  const bodyRows = rows.map((row, rowIndex) => {
    const zebra =
      rowIndex % 2 === 1 ? template.colors.zebraFillHex : "FFFFFF";
    return new TableRow({
      children: headers.map((_, columnIndex) => {
        const cell = row[columnIndex] ?? "";
        return new TableCell({
          width: { size: widths[columnIndex] ?? 1000, type: WidthType.DXA },
          shading: { fill: zebra, type: ShadingType.CLEAR },
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          borders: { top: border, bottom: border, left: border, right: border },
          children: [
            new Paragraph({
              alignment: cellAlignment(cell),
              spacing: { after: 0, line: 260 },
              children: [
                run(cell || " ", template, brand, {
                  size: Math.max(16, template.typography.bodyHalfPoints - 2),
                }),
              ],
            }),
          ],
        });
      }),
    });
  });

  return new Table({
    width: { size: usableDxa, type: WidthType.DXA },
    columnWidths: widths,
    rows: [headerRow, ...bodyRows],
  });
}

function blocksToChildren(
  blocks: DocumentModelBlock[],
  template: WordTemplateDefinition,
  brand: WordCompanyBrand | null,
  landscape: boolean,
): Array<Paragraph | Table> {
  const children: Array<Paragraph | Table> = [];
  const indent = template.typography.firstLineIndentDxa;

  for (const block of blocks) {
    switch (block.type) {
      case "paragraph":
        children.push(
          new Paragraph({
            spacing: {
              after: template.typography.paragraphSpacingAfter,
              line: template.typography.lineSpacing,
            },
            indent: indent > 0 ? { firstLine: indent } : undefined,
            children: [run(block.text, template, brand)],
          }),
        );
        break;
      case "bulletList":
        for (const item of block.items) {
          children.push(
            new Paragraph({
              spacing: { after: 80 },
              bullet: { level: 0 },
              children: [run(item, template, brand)],
            }),
          );
        }
        break;
      case "numberedList":
        block.items.forEach((item, index) => {
          children.push(
            new Paragraph({
              spacing: { after: 80 },
              children: [run(`${index + 1}. ${item}`, template, brand)],
            }),
          );
        });
        break;
      case "table":
        children.push(
          buildTable(block.headers, block.rows, template, brand, {
            landscape,
          }),
        );
        children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
        break;
      case "notice":
        children.push(
          new Paragraph({
            spacing: { before: 120, after: 120 },
            shading: {
              fill: template.colors.zebraFillHex,
              type: ShadingType.CLEAR,
            },
            border: {
              left: {
                color: template.colors.accentHex,
                size: 24,
                style: "single",
              },
            },
            children: [
              run(
                `${block.variant === "warning" ? "注意" : block.variant === "important" ? "重要" : "補足"}: ${block.text}`,
                template,
                brand,
                { size: template.typography.bodyHalfPoints - 2 },
              ),
            ],
          }),
        );
        break;
      case "quote":
        children.push(
          new Paragraph({
            spacing: { before: 100, after: 100 },
            indent: { left: 420 },
            children: [
              run(block.text, template, brand, {
                color: template.colors.mutedHex,
              }),
            ],
          }),
        );
        break;
      case "keyValue":
        for (const pair of block.pairs) {
          children.push(
            new Paragraph({
              spacing: { after: 80 },
              children: [
                run(`${pair.label}: `, template, brand, { bold: true }),
                run(pair.value || "未記入", template, brand),
              ],
            }),
          );
        }
        break;
      case "signature":
        children.push(new Paragraph({ spacing: { before: 200 }, children: [] }));
        for (const line of block.lines) {
          children.push(
            new Paragraph({
              spacing: { after: 80 },
              children: [run(line, template, brand)],
            }),
          );
        }
        break;
      case "imagePlaceholder":
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 120, after: 80 },
            shading: { fill: "F2F2F2", type: ShadingType.CLEAR },
            children: [
              run(`[ 画像プレースホルダ ]`, template, brand, {
                color: "888888",
                bold: true,
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 160 },
            children: [
              run(block.caption, template, brand, {
                size: CAPTION_SIZE,
                color: template.colors.mutedHex,
              }),
            ],
          }),
        );
        break;
      case "pageBreak":
        children.push(
          new Paragraph({
            children: [new PageBreak()],
          }),
        );
        break;
    }
  }
  return children;
}

function buildHeader(
  template: WordTemplateDefinition,
  brand: WordCompanyBrand | null,
  model: DocumentModel,
): Header | undefined {
  if (!template.showHeader) return undefined;
  const letterhead = formatCompanyLetterhead(brand);
  const parts: string[] = [];
  if (template.showCompanyInfo && letterhead.lines[0]) {
    parts.push(letterhead.lines[0]);
  }
  parts.push(model.title);
  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          run(parts.join(" · "), template, brand, {
            size: CAPTION_SIZE,
            color: template.colors.mutedHex,
          }),
        ],
      }),
    ],
  });
}

function buildFooter(
  template: WordTemplateDefinition,
  brand: WordCompanyBrand | null,
  model: DocumentModel,
): Footer | undefined {
  if (!template.showFooter && !template.showPageNumbers) return undefined;
  const letterhead = formatCompanyLetterhead(brand);
  const label =
    model.footerNote ||
    letterhead.footer ||
    (template.showCompanyInfo && letterhead.lines[0]) ||
    "MINERVOT";

  const children: TextRun[] = [
    run(String(label), template, brand, {
      size: CAPTION_SIZE,
      color: template.colors.mutedHex,
    }),
  ];
  if (template.showPageNumbers) {
    children.push(
      run("  ·  ", template, brand, {
        size: CAPTION_SIZE,
        color: template.colors.mutedHex,
      }),
      new TextRun({
        children: ["", PageNumber.CURRENT],
        font: {
          ascii: resolveFonts(template, brand).ascii,
          eastAsia: resolveFonts(template, brand).eastAsia,
          hAnsi: resolveFonts(template, brand).ascii,
        },
        size: CAPTION_SIZE,
        color: template.colors.mutedHex,
      }),
    );
  }

  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children,
      }),
    ],
  });
}

function estimateWideTable(model: DocumentModel): boolean {
  for (const section of model.sections) {
    for (const block of section.blocks) {
      if (block.type === "table" && block.headers.length >= 6) return true;
      if (block.type === "table") {
        const maxCell = Math.max(
          0,
          ...block.rows.flatMap((row) => row.map((cell) => cell.length)),
        );
        if (block.headers.length >= 4 && maxCell > 40) return true;
      }
    }
  }
  return false;
}

export type RenderDocxInput = {
  model: DocumentModel;
  templateId?: WordTemplateId;
  brand?: WordCompanyBrand | null;
};

/**
 * Shared Word rendering engine — template config drives layout; no Packer clones per template.
 */
export async function renderDocumentModelToDocx(
  input: RenderDocxInput,
): Promise<Buffer> {
  const templateId = (input.templateId ??
    input.model.templateId ??
    "standard-document") as WordTemplateId;
  const template = {
    ...getWordTemplate(templateId),
    colors: { ...getWordTemplate(templateId).colors },
    typography: { ...getWordTemplate(templateId).typography },
    marginsDxa: { ...getWordTemplate(templateId).marginsDxa },
  };
  const brand = input.brand ?? null;
  const letterhead = formatCompanyLetterhead(brand);
  const wide = estimateWideTable(input.model);
  const landscape =
    template.orientation === "landscape" ||
    (template.orientation === "auto" && wide);

  if (brand?.brandColorHex) {
    template.colors.accentHex = brand.brandColorHex;
    template.colors.headerFillHex = brand.brandColorHex;
  }

  const children: Array<Paragraph | Table> = [];

  // Title / letter cover
  if (template.showCompanyInfo && letterhead.lines.length > 0) {
    for (const line of letterhead.lines.slice(0, 4)) {
      children.push(
        new Paragraph({
          spacing: { after: 40 },
          children: [
            run(line, template, brand, {
              size: CAPTION_SIZE,
              color: template.colors.mutedHex,
            }),
          ],
        }),
      );
    }
  }

  if (input.model.recipient) {
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 120 },
        children: [
          run(`${input.model.recipient} 様`, template, brand, {
            size: template.typography.bodyHalfPoints + 2,
          }),
        ],
      }),
    );
  }

  children.push(
    new Paragraph({
      spacing: { before: template.preferCompactCover ? 200 : 400, after: 200 },
      children: [
        run(input.model.title, template, brand, {
          bold: true,
          size: template.typography.titleHalfPoints,
          color: template.colors.accentHex,
        }),
      ],
    }),
  );

  if (input.model.subtitle) {
    children.push(
      new Paragraph({
        spacing: { after: 200 },
        children: [
          run(input.model.subtitle, template, brand, {
            size: template.typography.h2HalfPoints - 2,
            color: "444444",
          }),
        ],
      }),
    );
  }

  const metaBits = [
    formatDate(template, input.model.createdAt),
    input.model.author,
    input.model.companyName,
  ].filter((value): value is string => Boolean(value?.trim()));
  if (metaBits.length > 0) {
    children.push(
      new Paragraph({
        spacing: { after: 280 },
        children: [
          run(metaBits.join(" ｜ "), template, brand, {
            size: CAPTION_SIZE,
            color: template.colors.mutedHex,
          }),
        ],
      }),
    );
  }

  if (template.pageBreakRule === "title_page_only") {
    children.push(new Paragraph({ children: [new PageBreak()] }));
  }

  const includeToc = Boolean(
    template.includeToc || input.model.metadata?.includeToc,
  );
  if (includeToc) {
    children.push(
      new Paragraph({
        spacing: { after: 120 },
        children: [
          run("目次", template, brand, {
            bold: true,
            size: template.typography.h2HalfPoints,
          }),
        ],
      }),
      new Paragraph({
        spacing: { after: 80 },
        children: [
          run(
            "※ Microsoft Word で開いた後、目次を右クリックして「フィールド更新」を行ってください。",
            template,
            brand,
            { size: CAPTION_SIZE, color: template.colors.mutedHex },
          ),
        ],
      }),
      new TableOfContents("目次", {
        hyperlink: true,
        headingStyleRange: "1-3",
      }),
    );
  }

  if (input.model.summary?.trim()) {
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 120 },
        children: [
          run("概要", template, brand, {
            bold: true,
            size: template.typography.h2HalfPoints,
            color: template.colors.accentHex,
          }),
        ],
      }),
      new Paragraph({
        spacing: {
          after: template.typography.paragraphSpacingAfter,
          line: template.typography.lineSpacing,
        },
        children: [run(input.model.summary.trim(), template, brand)],
      }),
    );
  }

  input.model.sections.forEach((section, index) => {
    if (section.pageBreakBefore && index > 0) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }

    const headingLevel =
      section.level === 1
        ? HeadingLevel.HEADING_1
        : section.level === 2
          ? HeadingLevel.HEADING_2
          : HeadingLevel.HEADING_3;
    const headingSize =
      section.level === 1
        ? template.typography.h1HalfPoints
        : section.level === 2
          ? template.typography.h2HalfPoints
          : template.typography.h3HalfPoints;

    children.push(
      new Paragraph({
        heading: headingLevel,
        spacing: {
          before: section.level === 1 ? 360 : 280,
          after: 140,
        },
        keepNext: section.keepWithNext !== false,
        children: [
          run(section.title, template, brand, {
            bold: true,
            size: headingSize,
            color: template.colors.accentHex,
          }),
        ],
      }),
    );
    children.push(
      ...blocksToChildren(section.blocks, template, brand, landscape),
    );
  });

  if (wide && template.orientation === "auto") {
    children.unshift(
      new Paragraph({
        spacing: { after: 120 },
        children: [
          run(
            "※ 表の列が多いため、閲覧時はページを横向きにすると読みやすくなります。内容は削除していません。",
            template,
            brand,
            { size: CAPTION_SIZE, color: template.colors.mutedHex },
          ),
        ],
      }),
    );
  }

  const fonts = resolveFonts(template, brand);
  const header = buildHeader(template, brand, input.model);
  const footer = buildFooter(template, brand, input.model);

  const doc = new Document({
    creator: "MINERVOT",
    title: input.model.title,
    description: "MINERVOT Word deliverable",
    styles: {
      default: {
        document: {
          run: {
            font: {
              ascii: fonts.ascii,
              eastAsia: fonts.eastAsia,
              hAnsi: fonts.ascii,
            },
            size: template.typography.bodyHalfPoints,
          },
          paragraph: {
            spacing: { line: template.typography.lineSpacing },
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: landscape
              ? {
                  // A4 landscape
                  width: convertInchesToTwip(11.69),
                  height: convertInchesToTwip(8.27),
                }
              : {
                  width: convertInchesToTwip(8.27),
                  height: convertInchesToTwip(11.69),
                },
            margin: template.marginsDxa,
            pageNumbers: template.hidePageNumberOnFirstPage
              ? { start: 1 }
              : undefined,
          },
        },
        headers: header ? { default: header } : undefined,
        footers: footer ? { default: footer } : undefined,
        children,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

/** Approximate page count for preview (A4, ~500 chars / page heuristic). */
export function estimatePageCount(model: DocumentModel): number {
  const textLength = [
    model.title,
    model.subtitle ?? "",
    model.summary ?? "",
    ...model.sections.flatMap((section) => [
      section.title,
      ...section.blocks.map((block) => {
        switch (block.type) {
          case "paragraph":
          case "notice":
          case "quote":
            return block.text;
          case "bulletList":
          case "numberedList":
            return block.items.join(" ");
          case "table":
            return `${block.headers.join(" ")} ${block.rows.flat().join(" ")}`;
          case "keyValue":
            return block.pairs.map((p) => `${p.label}${p.value}`).join(" ");
          case "signature":
            return block.lines.join(" ");
          default:
            return "";
        }
      }),
    ]),
  ]
    .join(" ")
    .replace(/\s+/g, "").length;

  return Math.max(1, Math.ceil(textLength / 500));
}
