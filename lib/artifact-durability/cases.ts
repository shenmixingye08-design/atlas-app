import type {
  ArtifactEvalCase,
  ArtifactFormatUnderTest,
} from "@/lib/artifact-durability/types";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function uniqueToken(format: string, category: string, i: number): string {
  return `${format.toUpperCase()}-${category}-${pad2(i)}-${1000 + i * 17}`;
}

function mdDoc(input: {
  title: string;
  token: string;
  sections: string[];
  table?: boolean;
  photoNote?: boolean;
}): string {
  const lines = [
    `# ${input.title}`,
    "",
    `識別子: ${input.token}`,
    "",
    "## 概要",
    `${input.title}の耐久試験用本文です。日本語の文字化けがないことを確認します。`,
    "",
  ];
  for (const [idx, section] of input.sections.entries()) {
    lines.push(`## ${idx + 1}. ${section}`);
    lines.push(
      `${section}に関する詳細です。ケース固有値 ${input.token} を含みます。`
    );
    lines.push("");
  }
  if (input.table) {
    lines.push("## 表");
    lines.push("| 項目 | 数量 | 金額 |");
    lines.push("| --- | ---: | ---: |");
    lines.push(`| 検証品A | ${Number(input.token.slice(-2)) || 1} | 1200 |`);
    lines.push(`| 検証品B | ${(Number(input.token.slice(-2)) || 1) + 3} | 3400 |`);
    lines.push("");
  }
  if (input.photoNote) {
    lines.push("## 写真");
    lines.push(`（写真参照メモ: ${input.token} — 合成文書、実写なし）`);
    lines.push("");
  }
  lines.push("## 結論");
  lines.push("MINERVOT成果物耐久試験の合成ドキュメントです。");
  return lines.join("\n");
}

function excelMd(input: {
  title: string;
  token: string;
  sheets: string[];
  withChart?: boolean;
}): string {
  const rows = Array.from({ length: 8 }, (_, r) => {
    const a = 100 + r * 13 + Number(input.token.slice(-3)) % 50;
    const b = a * 1.1;
    return `| ${input.token}-R${r + 1} | ${a} | ${b.toFixed(1)} | 2026-0${(r % 9) + 1}-15 |`;
  });
  return [
    `# ${input.title}`,
    "",
    `識別子: ${input.token}`,
    "",
    `シート構成: ${input.sheets.join(" / ")}`,
    "",
    "| 品目 | 数量 | 金額 | 日付 |",
    "| --- | ---: | ---: | --- |",
    ...rows,
    "",
    input.withChart ? "グラフ: 数量と金額の集計を含めてください。" : "",
    `複数シート: ${input.sheets.length >= 2 ? "はい" : "いいえ"}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function pptxMd(input: {
  title: string;
  token: string;
  slides: string[];
}): string {
  const parts = [`# ${input.title}`, "", `識別子: ${input.token}`, ""];
  for (const [i, s] of input.slides.entries()) {
    parts.push(`## スライド${i + 1}: ${s}`);
    parts.push(`- ${s}の要点`);
    parts.push(`- 固有値 ${input.token}`);
    parts.push("");
  }
  return parts.join("\n");
}

const WORD_CATEGORIES = [
  "議事録",
  "報告書",
  "企画書",
  "提案書",
  "契約書ドラフト",
  "履歴書職務経歴書",
  "マニュアル",
  "案内文",
  "写真付き文書",
  "表を含む文書",
] as const;

const EXCEL_CATEGORIES = [
  "売上管理表",
  "家計簿",
  "顧客管理",
  "在庫管理",
  "勤怠表",
  "工程表",
  "見積一覧",
  "請求一覧",
  "グラフ付き集計",
  "複数シート",
] as const;

const PDF_CATEGORIES = [
  "報告書",
  "見積書",
  "請求書",
  "契約書ドラフト",
  "写真付き報告書",
  "複数ページ文書",
  "表を含む文書",
  "Word→PDF",
  "Excel→PDF",
  "画像→PDF",
] as const;

const PPTX_CATEGORIES = [
  "営業資料",
  "会社紹介",
  "月次報告",
  "企画提案",
  "研修資料",
  "セミナー資料",
  "Excel→PowerPoint",
  "Word→PowerPoint",
  "PDF→PowerPoint",
  "画像付き資料",
] as const;

function buildWordCases(): ArtifactEvalCase[] {
  const out: ArtifactEvalCase[] = [];
  for (const [ci, cat] of WORD_CATEGORIES.entries()) {
    for (let i = 1; i <= 10; i++) {
      const caseId = `ad_docx_${pad2(ci + 1)}_${pad2(i)}`;
      const token = uniqueToken("docx", cat, ci * 10 + i);
      out.push({
        caseId,
        format: "docx",
        category: cat,
        title: `${cat} ${pad2(i)}`,
        assignment: `${cat}をWordで作成して。識別子 ${token}`,
        content: mdDoc({
          title: `${cat} ${pad2(i)}`,
          token,
          sections: [`背景-${token}`, `実施内容-${i}`, `次のアクション-${i}`],
          table: cat === "表を含む文書" || i % 3 === 0,
          photoNote: cat === "写真付き文書",
        }),
        notes: "合成Word。実個人情報なし",
        tags: cat === "履歴書職務経歴書" ? ["sensitive_synth"] : [],
      });
    }
  }
  return out;
}

function buildExcelCases(): ArtifactEvalCase[] {
  const out: ArtifactEvalCase[] = [];
  for (const [ci, cat] of EXCEL_CATEGORIES.entries()) {
    for (let i = 1; i <= 10; i++) {
      const caseId = `ad_xlsx_${pad2(ci + 1)}_${pad2(i)}`;
      const token = uniqueToken("xlsx", cat, ci * 10 + i);
      const multi = cat === "複数シート" || i % 4 === 0;
      const sheets = multi
        ? [`概要_${token}`, `明細_${token}`, `集計_${token}`]
        : [`${cat}_${token}`];
      out.push({
        caseId,
        format: "xlsx",
        category: cat,
        title: `${cat} ${pad2(i)}`,
        assignment: `${cat}をExcelで作って。識別子 ${token}`,
        content: excelMd({
          title: `${cat} ${pad2(i)}`,
          token,
          sheets,
          withChart: cat === "グラフ付き集計" || i % 5 === 0,
        }),
        expectedSheetsOrSlides: sheets.length,
        notes: "合成Excel",
      });
    }
  }
  return out;
}

function buildPdfCases(): ArtifactEvalCase[] {
  const out: ArtifactEvalCase[] = [];
  for (const [ci, cat] of PDF_CATEGORIES.entries()) {
    for (let i = 1; i <= 10; i++) {
      const caseId = `ad_pdf_${pad2(ci + 1)}_${pad2(i)}`;
      const token = uniqueToken("pdf", cat, ci * 10 + i);
      const multiPage = cat === "複数ページ文書" || i > 6;
      const sections = multiPage
        ? [
            `章1-${token}`,
            `章2-${token}`,
            `章3-${token}`,
            `章4-${token}`,
            `章5-${token}`,
          ]
        : [`内容-${token}`, `補足-${i}`];
      out.push({
        caseId,
        format: "pdf",
        category: cat,
        title: `${cat} ${pad2(i)}`,
        assignment: `${cat}をPDFで出力。識別子 ${token}`,
        content: mdDoc({
          title: `${cat} ${pad2(i)}`,
          token,
          sections,
          table: cat === "表を含む文書" || cat.includes("見積") || cat.includes("請求"),
          photoNote: cat.includes("写真") || cat === "画像→PDF",
        }),
        notes:
          cat.includes("→PDF")
            ? "ネイティブPDF生成ケース（変換スイートで別途変換も実施）"
            : "合成PDF",
        tags: cat.includes("→") ? ["convert_source_hint"] : [],
      });
    }
  }
  return out;
}

function buildPptxCases(): ArtifactEvalCase[] {
  const out: ArtifactEvalCase[] = [];
  for (const [ci, cat] of PPTX_CATEGORIES.entries()) {
    for (let i = 1; i <= 10; i++) {
      const caseId = `ad_pptx_${pad2(ci + 1)}_${pad2(i)}`;
      const token = uniqueToken("pptx", cat, ci * 10 + i);
      const slides = [
        `表紙-${token}`,
        `課題-${i}`,
        `提案-${token}`,
        `スケジュール-${i}`,
        `まとめ-${token}`,
      ];
      out.push({
        caseId,
        format: "pptx",
        category: cat,
        title: `${cat} ${pad2(i)}`,
        assignment: `${cat}のスライドを作って。識別子 ${token}`,
        content: pptxMd({
          title: `${cat} ${pad2(i)}`,
          token,
          slides,
        }),
        expectedSheetsOrSlides: slides.length,
        notes: "合成PowerPoint",
        tags: cat.includes("→") ? ["convert_source_hint"] : [],
      });
    }
  }
  return out;
}

export function buildArtifactDurabilityCases(): ArtifactEvalCase[] {
  return [
    ...buildWordCases(),
    ...buildExcelCases(),
    ...buildPdfCases(),
    ...buildPptxCases(),
  ];
}

export const ARTIFACT_DURABILITY_CASES = buildArtifactDurabilityCases();

export function assertArtifactCaseCounts(
  cases: ArtifactEvalCase[] = ARTIFACT_DURABILITY_CASES
): void {
  if (cases.length < 400) throw new Error(`expected >=400, got ${cases.length}`);
  const byFormat = (f: ArtifactFormatUnderTest) =>
    cases.filter((c) => c.format === f).length;
  for (const f of ["docx", "xlsx", "pdf", "pptx"] as const) {
    if (byFormat(f) < 100) throw new Error(`${f} < 100`);
  }
  const ids = new Set(cases.map((c) => c.caseId));
  if (ids.size !== cases.length) throw new Error("duplicate caseId");
  const contents = new Set(cases.map((c) => c.content));
  if (contents.size !== cases.length) throw new Error("duplicate content (padding)");
}
