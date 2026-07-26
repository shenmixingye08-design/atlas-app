import {
  AlignmentType,
  Document,
  Footer,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx"

import type { DocumentSection, StructuredDocument } from "../document/types"

const FONT_CANDIDATES = ["Yu Gothic", "Meiryo", "Noto Sans JP", "sans-serif"]
const FONT = FONT_CANDIDATES[0]!
const EAST_ASIA = FONT_CANDIDATES[0]!

function run(
  text: string,
  options?: { bold?: boolean; size?: number; color?: string },
): TextRun {
  return new TextRun({
    text,
    font: { ascii: FONT, eastAsia: EAST_ASIA, hAnsi: FONT },
    size: options?.size ?? 22,
    bold: options?.bold,
    color: options?.color,
  })
}

function paragraph(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 180, line: 288 },
    children: [run(text)],
  })
}

function heading(text: string, level: 1 | 2 | 3): Paragraph {
  const map = {
    1: { level: HeadingLevel.HEADING_1, size: 32 },
    2: { level: HeadingLevel.HEADING_2, size: 28 },
    3: { level: HeadingLevel.HEADING_3, size: 24 },
  } as const
  const cfg = map[level]
  return new Paragraph({
    heading: cfg.level,
    spacing: { before: level === 1 ? 320 : 240, after: 120 },
    children: [run(text, { bold: true, size: cfg.size, color: "111111" })],
  })
}

function bullets(items: string[]): Paragraph[] {
  return items.map(
    (item) =>
      new Paragraph({
        spacing: { after: 80 },
        bullet: { level: 0 },
        children: [run(item)],
      }),
  )
}

function numbered(items: string[]): Paragraph[] {
  return items.map(
    (item, index) =>
      new Paragraph({
        spacing: { after: 80 },
        children: [run(`${index + 1}. ${item}`)],
      }),
  )
}

function table(headers: string[], rows: string[][]): Table {
  const cols = Math.max(headers.length, 1)
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(
      (h) =>
        new TableCell({
          width: { size: 100 / cols, type: WidthType.PERCENTAGE },
          shading: { fill: "F3F3F3", type: ShadingType.CLEAR },
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          children: [
            new Paragraph({
              children: [run(h, { bold: true, color: "111111" })],
            }),
          ],
        }),
    ),
  })
  const body = rows.map(
    (row) =>
      new TableRow({
        children: Array.from({ length: cols }, (_, i) => {
          const cell = row[i] ?? ""
          return new TableCell({
            width: { size: 100 / cols, type: WidthType.PERCENTAGE },
            margins: { top: 50, bottom: 50, left: 100, right: 100 },
            children: [new Paragraph({ children: [run(cell)] })],
          })
        }),
      }),
  )
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...body],
  })
}

function sectionChildren(
  section: DocumentSection,
): Array<Paragraph | Table> {
  switch (section.type) {
    case "heading":
      return [heading(section.text, section.level)]
    case "paragraph":
      return [paragraph(section.text)]
    case "quote":
      return [
        new Paragraph({
          spacing: { after: 160 },
          children: [run(section.text, { color: "333333" })],
        }),
      ]
    case "bulletList":
      return bullets(section.items)
    case "numberedList":
      return numbered(section.items)
    case "table":
      return [table(section.headers, section.rows), new Paragraph({ children: [] })]
    case "pageBreak":
      return [
        new Paragraph({
          children: [],
          pageBreakBefore: true,
        }),
      ]
  }
}

export async function renderWordFromDocument(
  doc: StructuredDocument,
): Promise<{ buffer: Buffer; textLength: number; paragraphCount: number }> {
  const children: Array<Paragraph | Table> = [
    new Paragraph({
      spacing: { after: 240 },
      children: [run(doc.title, { bold: true, size: 40, color: "111111" })],
    }),
  ]
  if (doc.summary?.trim()) {
    children.push(heading("概要", 2), paragraph(doc.summary))
  }
  let paragraphCount = 1
  for (const section of doc.sections) {
    const parts = sectionChildren(section)
    children.push(...parts)
    paragraphCount += parts.filter((p) => p instanceof Paragraph).length
  }

  const document = new Document({
    creator: "MINERVOT",
    title: doc.title,
    styles: {
      default: {
        document: {
          run: {
            font: { ascii: FONT, eastAsia: EAST_ASIA, hAnsi: FONT },
            size: 22,
            color: "111111",
          },
          paragraph: { spacing: { line: 276 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  run("MINERVOT · ", { size: 16, color: "666666" }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: { ascii: FONT, eastAsia: EAST_ASIA, hAnsi: FONT },
                    size: 16,
                    color: "666666",
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  })

  const buffer = Buffer.from(await Packer.toBuffer(document))
  const textLength =
    doc.title.length +
    (doc.summary?.length ?? 0) +
    doc.sections.reduce((n, s) => {
      if (s.type === "heading" || s.type === "paragraph" || s.type === "quote") {
        return n + s.text.length
      }
      if (s.type === "bulletList" || s.type === "numberedList") {
        return n + s.items.join("").length
      }
      if (s.type === "table") {
        return n + s.headers.join("").length + s.rows.flat().join("").length
      }
      return n
    }, 0)

  return { buffer, textLength, paragraphCount }
}
