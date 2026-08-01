import type { WordTemplateId } from "@/lib/deliverables/word-templates";

export type WordProductionCase = {
  caseId: string;
  category:
    | "report"
    | "minutes"
    | "contract"
    | "proposal"
    | "plan"
    | "spec"
    | "manual"
    | "photo_report"
    | "longform"
    | "table_heavy";
  templateId: WordTemplateId;
  title: string;
  /** Approximate target pages for long-form builders. */
  targetPages?: number;
  buildContent: () => string;
};

function section(title: string, paragraphs: number, seed: number): string {
  const lines = [`## ${title}`, ""];
  for (let i = 0; i < paragraphs; i += 1) {
    lines.push(
      `本項${i + 1}では、案件番号 ${seed}-${i + 1} の進捗・論点・次アクションを整理します。` +
        `関係者合意のうえ、期限までに成果物を提出します。日本語の禁則と句読点、英数字混在（API v${seed}.${i}）を確認します。`,
    );
    lines.push("");
  }
  return lines.join("\n");
}

function tableBlock(seed: number, rows: number): string {
  const lines = [
    "| 項目 | 担当 | 期限 | 状態 | 金額 |",
    "| --- | --- | --- | --- | ---: |",
  ];
  for (let i = 0; i < rows; i += 1) {
    lines.push(
      `| 作業${seed}-${i + 1} | 担当${(i % 5) + 1} | 2026-0${(i % 9) + 1}-15 | 進行中 | ${(i + 1) * 12000}円 |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function longContent(pages: number, seed: number): string {
  // ~500 chars / page heuristic used by estimatePageCount
  const paragraphsPerPage = 6;
  const parts = [
    `# 長文耐久試験 ${pages}ページ（seed=${seed}）`,
    "",
    "> 本ドキュメントは Production Ready 品質検証用の長文サンプルです。",
    "",
    tableBlock(seed, Math.min(12, 3 + pages)),
    "",
  ];
  const sections = Math.max(2, pages);
  for (let s = 0; s < sections; s += 1) {
    parts.push(section(`第${s + 1}章 検証セクション`, paragraphsPerPage, seed + s));
    if (s % 3 === 2) {
      parts.push("1. 確認事項A");
      parts.push("2. 確認事項B");
      parts.push("3. 確認事項C");
      parts.push("");
      parts.push("- 箇条書きポイント1");
      parts.push("- 箇条書きポイント2");
      parts.push("");
      parts.push("![図表キャプション](image-placeholder)");
      parts.push("");
    }
  }
  return parts.join("\n");
}

const CATEGORY_TEMPLATES: Array<{
  category: WordProductionCase["category"];
  templateId: WordTemplateId;
  titlePrefix: string;
}> = [
  { category: "report", templateId: "business-report", titlePrefix: "業務報告書" },
  { category: "minutes", templateId: "meeting-minutes", titlePrefix: "議事録" },
  { category: "contract", templateId: "customer-letter", titlePrefix: "契約関連文書" },
  { category: "proposal", templateId: "proposal", titlePrefix: "提案書" },
  { category: "plan", templateId: "standard-document", titlePrefix: "企画書" },
  { category: "spec", templateId: "manual", titlePrefix: "仕様書" },
  { category: "manual", templateId: "manual", titlePrefix: "操作マニュアル" },
  { category: "photo_report", templateId: "business-report", titlePrefix: "写真付き報告書" },
  { category: "longform", templateId: "business-report", titlePrefix: "長文報告書" },
  { category: "table_heavy", templateId: "comparison-table", titlePrefix: "表中心資料" },
];

export function buildWordProductionCases(count = 100): WordProductionCase[] {
  const cases: WordProductionCase[] = [];
  for (let i = 0; i < count; i += 1) {
    const meta = CATEGORY_TEMPLATES[i % CATEGORY_TEMPLATES.length]!;
    const seed = i + 1;
    cases.push({
      caseId: `word_prod_${String(seed).padStart(3, "0")}`,
      category: meta.category,
      templateId: meta.templateId,
      title: `${meta.titlePrefix} ${seed}`,
      buildContent: () => {
        if (meta.category === "longform") {
          return longContent(8 + (seed % 5), seed);
        }
        if (meta.category === "table_heavy") {
          return [
            `# ${meta.titlePrefix} ${seed}`,
            "",
            "## 比較表",
            "",
            tableBlock(seed, 20),
            "",
            section("解説", 4, seed),
          ].join("\n");
        }
        if (meta.category === "photo_report") {
          return [
            `# ${meta.titlePrefix} ${seed}`,
            "",
            section("現場概要", 3, seed),
            "![現場写真1](image-placeholder)",
            "",
            "![現場写真2](image-placeholder)",
            "",
            tableBlock(seed, 6),
            section("所見", 3, seed),
          ].join("\n");
        }
        if (meta.category === "contract") {
          return [
            `# ${meta.titlePrefix} ${seed}`,
            "",
            "本契約書は検証用サンプルであり、法的効力を持ちません。",
            "",
            "1. 目的",
            "2. 期間",
            "3. 対価",
            "4. 秘密保持",
            "",
            section("条項詳細", 5, seed),
            tableBlock(seed, 4),
          ].join("\n");
        }
        return [
          `# ${meta.titlePrefix} ${seed}`,
          "",
          section("背景", 2, seed),
          section("実施内容", 3, seed),
          tableBlock(seed, 5),
          "1. 次のアクション",
          "2. リスク",
          "3. スケジュール",
          "",
          "- 論点A",
          "- 論点B",
          "",
          section("まとめ", 2, seed),
        ].join("\n");
      },
    });
  }
  return cases;
}

export const LONG_PAGE_TARGETS = [1, 5, 20, 50, 100] as const;

export function buildLongPageCase(pages: number): WordProductionCase {
  return {
    caseId: `word_long_${pages}p`,
    category: "longform",
    templateId: "business-report",
    title: `長文耐久 ${pages}ページ`,
    targetPages: pages,
    buildContent: () => longContent(pages, pages * 17),
  };
}
