import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib"

import type { DocumentSection, StructuredDocument } from "../document/types"
import {
  fontForChar,
  loadExportPdfFonts,
  type ExportPdfFontPair,
} from "../fonts/load-export-font"

const PAGE_WIDTH = 595.28 // A4
const PAGE_HEIGHT = 841.89
const MARGIN = 48
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const TEXT_COLOR = rgb(0.07, 0.07, 0.07)

type Cursor = {
  page: PDFPage
  y: number
}

function paintWhite(page: PDFPage): void {
  page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    color: rgb(1, 1, 1),
  })
}

function widthOf(fonts: ExportPdfFontPair, text: string, size: number): number {
  let w = 0
  for (const char of text) {
    w += fontForChar(fonts, char).widthOfTextAtSize(char, size)
  }
  return w
}

function drawMixedLine(params: {
  page: PDFPage
  fonts: ExportPdfFontPair
  text: string
  x: number
  y: number
  size: number
}): void {
  let x = params.x
  for (const char of params.text) {
    const font = fontForChar(params.fonts, char)
    try {
      params.page.drawText(char, {
        x,
        y: params.y,
        size: params.size,
        font,
        color: TEXT_COLOR,
      })
      x += font.widthOfTextAtSize(char, params.size)
    } catch {
      // Skip undecodable glyph rather than aborting the page.
    }
  }
}

function wrapLine(
  fonts: ExportPdfFontPair,
  text: string,
  size: number,
  maxWidth: number,
): string[] {
  const lines: string[] = []
  let current = ""
  for (const char of text) {
    const candidate = current + char
    if (widthOf(fonts, candidate, size) > maxWidth && current) {
      lines.push(current)
      current = char
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)
  return lines.length ? lines : [""]
}

export type PdfRenderResult = {
  buffer: Buffer
  pageCount: number
  renderedTextLength: number
  fileSize: number
  fontSource: string
}

export async function renderPdfFromDocument(
  doc: StructuredDocument,
): Promise<PdfRenderResult> {
  const pdfDoc = await PDFDocument.create()
  const fonts = await loadExportPdfFonts(pdfDoc)
  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  paintWhite(page)
  let y = PAGE_HEIGHT - MARGIN
  let renderedTextLength = 0

  const ensureSpace = (needed: number): Cursor => {
    if (y - needed < MARGIN) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      paintWhite(page)
      y = PAGE_HEIGHT - MARGIN
    }
    return { page, y }
  }

  const drawTextBlock = (
    text: string,
    size: number,
    lineHeight: number,
    indent = 0,
  ) => {
    const maxWidth = CONTENT_WIDTH - indent
    for (const paragraph of text.split("\n")) {
      if (!paragraph.trim()) {
        ensureSpace(lineHeight)
        y -= lineHeight * 0.6
        continue
      }
      const lines = wrapLine(fonts, paragraph, size, maxWidth)
      for (const line of lines) {
        ensureSpace(lineHeight)
        drawMixedLine({
          page,
          fonts,
          text: line,
          x: MARGIN + indent,
          y,
          size,
        })
        renderedTextLength += line.length
        y -= lineHeight
      }
    }
  }

  drawTextBlock(doc.title, 18, 26)
  y -= 10

  if (doc.summary?.trim()) {
    drawTextBlock("概要", 13, 18)
    drawTextBlock(doc.summary, 11, 16)
    y -= 8
  }

  const drawSection = (section: DocumentSection) => {
    switch (section.type) {
      case "heading": {
        const size = section.level === 1 ? 15 : section.level === 2 ? 13 : 12
        y -= 8
        drawTextBlock(section.text, size, size + 6)
        y -= 4
        break
      }
      case "paragraph":
      case "quote":
        drawTextBlock(section.text, 11, 16)
        y -= 6
        break
      case "bulletList":
        for (const item of section.items) {
          // Use CJK middle dot — U+2022 often becomes tofu in fallback fonts.
          drawTextBlock(`・ ${item}`, 11, 16, 12)
        }
        y -= 6
        break
      case "numberedList":
        for (let i = 0; i < section.items.length; i += 1) {
          drawTextBlock(`${i + 1}. ${section.items[i]}`, 11, 16, 12)
        }
        y -= 6
        break
      case "table": {
        // Draw readable rows without markdown separator artifacts.
        if (section.headers.length) {
          drawTextBlock(section.headers.join("  /  "), 10, 14)
          drawTextBlock("-".repeat(Math.min(48, CONTENT_WIDTH / 6)), 8, 10)
        }
        for (const row of section.rows) {
          drawTextBlock(row.join("  /  "), 10, 14)
        }
        y -= 8
        break
      }
      case "pageBreak":
        page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
        paintWhite(page)
        y = PAGE_HEIGHT - MARGIN
        break
    }
  }

  for (const section of doc.sections) {
    drawSection(section)
  }

  if (renderedTextLength === 0 && doc.title) {
    drawTextBlock(doc.title, 12, 18)
  }

  const buffer = Buffer.from(await pdfDoc.save())
  return {
    buffer,
    pageCount: pdfDoc.getPageCount(),
    renderedTextLength,
    fileSize: buffer.byteLength,
    fontSource: fonts.sourcePath,
  }
}

// Keep type reference for unused import lint silence in some tooling.
export type _PdfFont = PDFFont
