import { PDFDocument, rgb } from "pdf-lib"

import type { DocumentSection, StructuredDocument } from "../document/types"
import {
  loadPdfFontForSubset,
  splitTextBySubset,
  subsetIndexForCodePoint,
} from "../fonts/japanese-pdf-fonts"

type PdfFonts = Map<number, Awaited<ReturnType<typeof loadPdfFontForSubset>>>

const PAGE_WIDTH = 595.28 // A4
const PAGE_HEIGHT = 841.89
const MARGIN = 48
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const TEXT_COLOR = rgb(0.07, 0.07, 0.07)

async function drawLine(params: {
  page: ReturnType<PDFDocument["getPages"]>[number]
  pdfDoc: PDFDocument
  fonts: PdfFonts
  text: string
  x: number
  y: number
  size: number
}): Promise<void> {
  let drawX = params.x
  for (const run of splitTextBySubset(params.text)) {
    if (!run.text) continue
    const font = await loadPdfFontForSubset(
      params.pdfDoc,
      params.fonts,
      run.index,
    )
    try {
      params.page.drawText(run.text, {
        x: drawX,
        y: params.y,
        size: params.size,
        font,
        color: TEXT_COLOR,
      })
      drawX += font.widthOfTextAtSize(run.text, params.size)
    } catch {
      // Skip glyphs the subset cannot encode rather than failing the whole PDF.
    }
  }
}

async function wrapAndDraw(params: {
  page: ReturnType<PDFDocument["getPages"]>[number]
  pdfDoc: PDFDocument
  fonts: PdfFonts
  text: string
  x: number
  y: number
  size: number
  lineHeight: number
  maxWidth: number
  ensureSpace: (needed: number) => Promise<{
    page: ReturnType<PDFDocument["getPages"]>[number]
    y: number
  }>
}): Promise<{ page: ReturnType<PDFDocument["getPages"]>[number]; y: number; chars: number }> {
  let { page, y } = params
  let chars = 0

  for (const paragraph of params.text.split("\n")) {
    if (!paragraph.trim()) {
      ;({ page, y } = await params.ensureSpace(params.lineHeight))
      y -= params.lineHeight
      continue
    }

    let line = ""
    const flush = async () => {
      if (!line) return
      ;({ page, y } = await params.ensureSpace(params.lineHeight))
      await drawLine({
        page,
        pdfDoc: params.pdfDoc,
        fonts: params.fonts,
        text: line,
        x: params.x,
        y,
        size: params.size,
      })
      chars += line.length
      y -= params.lineHeight
      line = ""
    }

    for (const char of paragraph) {
      const candidate = line + char
      const probeFont = await loadPdfFontForSubset(
        params.pdfDoc,
        params.fonts,
        subsetIndexForCodePoint(char.codePointAt(0) ?? 0),
      )
      const width = probeFont.widthOfTextAtSize(candidate, params.size)
      if (width > params.maxWidth && line) {
        await flush()
        line = char
      } else {
        line = candidate
      }
    }
    await flush()
  }

  return { page, y, chars }
}

export type PdfRenderResult = {
  buffer: Buffer
  pageCount: number
  renderedTextLength: number
  fileSize: number
}

export async function renderPdfFromDocument(
  doc: StructuredDocument,
): Promise<PdfRenderResult> {
  const pdfDoc = await PDFDocument.create()
  const fonts: PdfFonts = new Map()
  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y = PAGE_HEIGHT - MARGIN
  let renderedTextLength = 0

  const ensureSpace = async (needed: number) => {
    if (y - needed < MARGIN) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      y = PAGE_HEIGHT - MARGIN
    }
    return { page, y }
  }

  // White background (explicit)
  page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    color: rgb(1, 1, 1),
  })

  const paintBg = () => {
    page.drawRectangle({
      x: 0,
      y: 0,
      width: PAGE_WIDTH,
      height: PAGE_HEIGHT,
      color: rgb(1, 1, 1),
    })
  }

  const drawTextBlock = async (
    text: string,
    size: number,
    lineHeight: number,
    indent = 0,
  ) => {
    const result = await wrapAndDraw({
      page,
      pdfDoc,
      fonts,
      text,
      x: MARGIN + indent,
      y,
      size,
      lineHeight,
      maxWidth: CONTENT_WIDTH - indent,
      ensureSpace: async (needed) => {
        const before = page
        const space = await ensureSpace(needed)
        if (space.page !== before) paintBg()
        page = space.page
        y = space.y
        return { page, y }
      },
    })
    page = result.page
    y = result.y
    renderedTextLength += result.chars
  }

  await drawTextBlock(doc.title, 18, 24)
  y -= 8
  if (doc.summary?.trim()) {
    await drawTextBlock("概要", 13, 18)
    await drawTextBlock(doc.summary, 11, 16)
    y -= 6
  }

  const drawSection = async (section: DocumentSection) => {
    switch (section.type) {
      case "heading": {
        const size = section.level === 1 ? 15 : section.level === 2 ? 13 : 12
        y -= 6
        await drawTextBlock(section.text, size, size + 6)
        y -= 2
        break
      }
      case "paragraph":
      case "quote":
        await drawTextBlock(section.text, 11, 16)
        y -= 4
        break
      case "bulletList":
        for (const item of section.items) {
          await drawTextBlock(`• ${item}`, 11, 16, 10)
        }
        y -= 4
        break
      case "numberedList":
        for (let i = 0; i < section.items.length; i += 1) {
          await drawTextBlock(`${i + 1}. ${section.items[i]}`, 11, 16, 10)
        }
        y -= 4
        break
      case "table": {
        const rows = [section.headers, ...section.rows].filter((r) => r.length)
        for (const row of rows) {
          await drawTextBlock(row.join(" | "), 10, 14)
        }
        y -= 6
        break
      }
      case "pageBreak":
        page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
        paintBg()
        y = PAGE_HEIGHT - MARGIN
        break
    }
  }

  for (const section of doc.sections) {
    await drawSection(section)
  }

  if (renderedTextLength === 0 && doc.title) {
    // Absolute fallback — never return an empty visual PDF silently.
    await drawTextBlock(doc.title, 12, 18)
  }

  const buffer = Buffer.from(await pdfDoc.save())
  return {
    buffer,
    pageCount: pdfDoc.getPageCount(),
    renderedTextLength,
    fileSize: buffer.byteLength,
  }
}
