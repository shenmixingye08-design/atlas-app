import { existsSync, readFileSync } from "fs"
import { join } from "path"

import fontkit from "@pdf-lib/fontkit"
import {
  StandardFonts,
  type PDFDocument,
  type PDFFont,
} from "pdf-lib"

/** Bundled CJK font — path relative to this module for Next NFT tracing. */
const BUNDLED = join(__dirname, "assets", "DroidSansFallbackFull.ttf")

const SYSTEM_CANDIDATES = [
  process.env.ATLAS_PDF_FONT_PATH,
  BUNDLED,
  // Optional host fonts (not traced by the bundler).
  "/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf",
  "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
].filter((p): p is string => Boolean(p && p.trim()))

export type ExportPdfFontPair = {
  /** CJK-capable font */
  cjk: PDFFont
  /** Latin / digits / punctuation */
  latin: PDFFont
  sourcePath: string
}

function pickFontPath(): string {
  for (const candidate of SYSTEM_CANDIDATES) {
    if (existsSync(candidate)) return candidate
  }
  throw new Error(
    "Japanese PDF font not found. Bundle lib/deliverables/fonts/assets/DroidSansFallbackFull.ttf or set ATLAS_PDF_FONT_PATH.",
  )
}

/**
 * Load fonts that actually paint Japanese glyphs in pdf-lib.
 * Fontsource WOFF2 subsets previously produced blank pages / tofu shapes.
 */
export async function loadExportPdfFonts(
  pdfDoc: PDFDocument,
): Promise<ExportPdfFontPair> {
  pdfDoc.registerFontkit(fontkit)
  const sourcePath = pickFontPath()
  const bytes = readFileSync(sourcePath)
  // subset:false — subsetting Droid/CJK often drops glyphs and yields blank visuals.
  const cjk = await pdfDoc.embedFont(bytes, { subset: false })
  const latin = await pdfDoc.embedFont(StandardFonts.Helvetica)
  return { cjk, latin, sourcePath }
}

export function isMostlyLatin(char: string): boolean {
  const code = char.codePointAt(0) ?? 0
  // Basic Latin + Latin-1 + common punctuation used in JP docs (yen handled by CJK).
  return code <= 0x024f && code !== 0x00a5
}

export function fontForChar(
  fonts: ExportPdfFontPair,
  char: string,
): PDFFont {
  return isMostlyLatin(char) ? fonts.latin : fonts.cjk
}
