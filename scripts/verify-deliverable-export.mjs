/**
 * Real-file verification for Word/PDF/Web export quality.
 * Generates artifacts under artifacts/deliverable-export-verify/
 */
import { createRequire } from "module"
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs"
import { join } from "path"
import { execSync } from "child_process"
import { pathToFileURL } from "url"

const require = createRequire(import.meta.url)
const root = process.cwd()
const outDir = join(root, "artifacts/deliverable-export-verify")
mkdirSync(outDir, { recursive: true })

const TITLE = "今はやりのシングル向け選出"

const SOURCE = `# ${TITLE}

## はじめに

2026年現在、都市部を中心に「シングル向けライフスタイル提案」が注目されています。
本資料では、MINERVOT編集部が東京都・大阪市・福岡市の実地調査と公開統計を踏まえ、
20代後半から40代前半の単身世帯に向けた選出基準と具体的な提案項目を整理します。
対象は住居・食・移動・余暇の4領域で、予算帯は月額12万円〜28万円を想定しています。

## 選出の観点

単身者の満足度を左右する要素は、単なる価格競争ではありません。
通勤時間、近隣の夜間営業店舗、ゴミ出しのしやすさ、防音性能、宅配ボックスの有無など、
日常の摩擦をどれだけ減らせるかが重要です。また、趣味の拡張余地（防音室、自転車置き場、
リモートワーク机）も選出スコアに反映します。評価は100点満点で、70点以上を推薦候補とします。

### 評価項目一覧

1. 立地利便性（駅徒歩分数・夜間スーパー）
2. 住居快適性（防音・収納・採光）
3. コスト妥当性（家賃＋光熱費＋通信費）
4. ライフ拡張性（趣味・在宅勤務・来客）

## おすすめ選出セット

- 住居：駅徒歩8分以内の1K〜1LDK（オートロック・宅配ボックス必須）
- 食：週3回の自炊＋週2回の単身向けミールキット（原価管理つき）
- 移動：定期＋シェアサイクルの併用（月額上限9,800円）
- 余暇：月2回のライブ／展覧会枠と、近隣のコワーキング会員

### 比較表

| 項目 | プランA | プランB | プランC |
| --- | --- | --- | --- |
| 想定家賃 | 9.8万円 | 12.5万円 | 15.2万円 |
| 駅徒歩 | 10分 | 7分 | 5分 |
| 防音目安 | 標準 | 強化 | 高断熱+防音 |
| 推奨年収帯 | 400万円〜 | 500万円〜 | 650万円〜 |
| 総合点 | 74 | 83 | 91 |

## まとめ

シングル向け選出では「安さ」より「毎日の摩擦の少なさ」を優先すべきです。
MINERVOTは、上記の観点で候補を点数化し、ユーザーの勤務地・趣味・予算に合わせて
最短ルートで提案書を整えます。次のアクションは、勤務駅を基準にした3物件比較と、
食・移動の月次シミュレーションです。数値は2026年7月時点の目安であり、契約前に現地確認を推奨します。
`

function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

async function loadPipeline() {
  // Use vitest/node to transpile TS via dynamic import of built paths — instead run through tsx alternative:
  // Spawn a small vitest-less loader using next/typescript. Prefer compiling with node --experimental?
  // Use child process with npx vitest related - simplest: write a .ts file and run via vitest inline.
}

// Use jszip from docx dependency tree
function resolveJszip() {
  try {
    return require("jszip")
  } catch {
    // find nested
    const candidates = [
      "docx/node_modules/jszip",
      "./node_modules/docx/node_modules/jszip",
    ]
    for (const c of candidates) {
      try {
        return require(c)
      } catch {
        /* continue */
      }
    }
    throw new Error("jszip not found")
  }
}

async function extractDocxText(buffer) {
  const JSZip = resolveJszip()
  const zip = await JSZip.loadAsync(buffer)
  const xml = await zip.file("word/document.xml")?.async("string")
  if (!xml) return ""
  return xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

async function main() {
  // Generate via a temporary TS runner executed by vitest
  writeFileSync(
    join(root, "scripts/_gen-export-once.test.ts"),
    `
import { writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { describe, it, expect } from "vitest"
import { exportWithFallback } from "@/lib/deliverables/export/fallback"
import { normalizeToStructuredDocument, structuredDocumentToMarkdown, renderCanonicalHtml } from "@/lib/deliverables/document"

const TITLE = ${JSON.stringify(TITLE)}
const SOURCE = ${JSON.stringify(SOURCE)}
const outDir = join(process.cwd(), "artifacts/deliverable-export-verify")

describe("generate real export files", () => {
  it("writes docx/pdf/html artifacts", async () => {
    mkdirSync(outDir, { recursive: true })
    const normalized = normalizeToStructuredDocument(SOURCE, { titleHint: TITLE })
    const markdown = structuredDocumentToMarkdown(normalized.document)
    const html = renderCanonicalHtml(normalized.document)
    writeFileSync(join(outDir, "web-canonical.html"), html.html, "utf8")
    writeFileSync(join(outDir, "web-markdown.md"), markdown, "utf8")
    writeFileSync(join(outDir, "structured.json"), JSON.stringify(normalized.document, null, 2), "utf8")

    const word = await exportWithFallback({ source: SOURCE, format: "docx", titleHint: TITLE })
    expect(word.ok).toBe(true)
    writeFileSync(join(outDir, "single-selection.docx"), word.buffer!)

    const pdf = await exportWithFallback({ source: SOURCE, format: "pdf", titleHint: TITLE })
    expect(pdf.ok).toBe(true)
    writeFileSync(join(outDir, "single-selection.pdf"), pdf.buffer!)

    writeFileSync(join(outDir, "meta.json"), JSON.stringify({
      wordOk: word.ok,
      pdfOk: pdf.ok,
      wordTextLength: word.wordMeta?.textLength,
      pdfExtracted: pdf.pdfMeta?.extractedTextLength,
      pdfPages: pdf.pdfMeta?.pageCount,
      title: normalized.document.title,
      plainTextLength: normalized.plainText.length,
    }, null, 2))
  }, 120000)
})
`,
    "utf8",
  )

  execSync("npx vitest run scripts/_gen-export-once.test.ts", {
    cwd: root,
    stdio: "inherit",
  })

  const docxPath = join(outDir, "single-selection.docx")
  const pdfPath = join(outDir, "single-selection.pdf")
  assert(existsSync(docxPath), "docx missing")
  assert(existsSync(pdfPath), "pdf missing")

  const docxBuf = readFileSync(docxPath)
  const pdfBuf = readFileSync(pdfPath)
  const docxText = await extractDocxText(docxBuf)
  writeFileSync(join(outDir, "word-extracted.txt"), docxText, "utf8")

  const pdfText = execSync(`pdftotext -layout "${pdfPath}" -`, {
    encoding: "utf8",
  })
  writeFileSync(join(outDir, "pdf-extracted.txt"), pdfText, "utf8")

  execSync(
    `pdftoppm -png -r 140 "${pdfPath}" "${join(outDir, "pdf-page")}"`,
    { stdio: "inherit" },
  )

  const webMd = readFileSync(join(outDir, "web-markdown.md"), "utf8")
  const structured = JSON.parse(readFileSync(join(outDir, "structured.json"), "utf8"))

  const report = {
    docxPath,
    pdfPath,
    docxBytes: docxBuf.byteLength,
    pdfBytes: pdfBuf.byteLength,
    wordExtractedChars: docxText.replace(/\s+/g, "").length,
    pdfExtractedChars: pdfText.replace(/\s+/g, "").length,
    pdfExtractedRawChars: pdfText.length,
    pdfPageImages: execSync(`ls -1 ${outDir}/pdf-page*.png`, { encoding: "utf8" })
      .trim()
      .split("\n"),
    titleInWord: docxText.includes(TITLE),
    titleInPdf: pdfText.includes(TITLE),
    hasJsonInWord: /"type"\s*:|"content"\s*:|```json/.test(docxText),
    hasJsonInPdf: /"type"\s*:|"content"\s*:|```json/.test(pdfText),
    hasLiteralNewlineWord: docxText.includes("\\n"),
    hasLiteralNewlinePdf: pdfText.includes("\\n"),
    hasObjectObject: docxText.includes("[object Object]") || pdfText.includes("[object Object]"),
    hasUndefined: /\bundefined\b/.test(docxText) || /\bundefined\b/.test(pdfText),
    headings: {
      word: ["はじめに", "選出の観点", "おすすめ選出セット", "まとめ"].map((h) => ({
        h,
        ok: docxText.includes(h),
      })),
      pdf: ["はじめに", "選出の観点", "おすすめ選出セット", "まとめ"].map((h) => ({
        h,
        ok: pdfText.includes(h),
      })),
    },
    bullets: {
      word: docxText.includes("住居：") || docxText.includes("住居:"),
      pdf: pdfText.includes("住居：") || pdfText.includes("住居:"),
    },
    numbered: {
      word: /立地利便性/.test(docxText),
      pdf: /立地利便性/.test(pdfText),
    },
    table: {
      word: docxText.includes("プランA") && docxText.includes("9.8"),
      pdf: pdfText.includes("プランA") && pdfText.includes("9.8"),
    },
    webTitle: structured.title,
    consistency: {
      title:
        structured.title === TITLE &&
        docxText.includes(TITLE) &&
        pdfText.includes(TITLE),
      headingHajime: docxText.includes("はじめに") && pdfText.includes("はじめに") && webMd.includes("はじめに"),
      bulletJukyo:
        (docxText.includes("住居") && pdfText.includes("住居") && webMd.includes("住居")),
      numberRitchi:
        docxText.includes("立地利便性") &&
        pdfText.includes("立地利便性") &&
        webMd.includes("立地利便性"),
      score91: docxText.includes("91") && pdfText.includes("91") && webMd.includes("91"),
    },
  }

  writeFileSync(join(outDir, "verification-report.json"), JSON.stringify(report, null, 2))

  const failures = []
  if (report.wordExtractedChars < 500) failures.push(`word chars ${report.wordExtractedChars} < 500`)
  if (report.pdfExtractedChars < 500) failures.push(`pdf chars ${report.pdfExtractedChars} < 500`)
  if (!report.titleInWord) failures.push("word missing title")
  if (!report.titleInPdf) failures.push("pdf missing title")
  if (report.hasJsonInWord) failures.push("word has json")
  if (report.hasJsonInPdf) failures.push("pdf has json")
  if (report.hasLiteralNewlineWord) failures.push("word has \\\\n")
  if (report.hasLiteralNewlinePdf) failures.push("pdf has \\\\n")
  if (report.hasObjectObject) failures.push("[object Object]")
  if (report.docxBytes < 5000) failures.push("docx too small")
  if (report.pdfBytes < 2000) failures.push("pdf too small")
  if (!report.headings.word.every((x) => x.ok)) failures.push("word headings")
  if (!report.headings.pdf.every((x) => x.ok)) failures.push("pdf headings")
  if (!report.bullets.word || !report.bullets.pdf) failures.push("bullets")
  if (!report.numbered.word || !report.numbered.pdf) failures.push("numbered")
  if (!report.table.word || !report.table.pdf) failures.push("table")
  if (!Object.values(report.consistency).every(Boolean)) failures.push("consistency")
  if (report.pdfPageImages.length < 1) failures.push("no pdf images")

  console.log(JSON.stringify(report, null, 2))
  if (failures.length) {
    console.error("FAILURES:", failures)
    process.exit(1)
  }
  console.log("ALL REAL-FILE CHECKS PASSED")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
