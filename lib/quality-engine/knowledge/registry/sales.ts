import type { KnowledgeEntry } from "../types";

export const SALES_KNOWLEDGE: readonly KnowledgeEntry[] = [
  {
    id: "sales.structure",
    layer: "deliverable",
    title: "営業構成",
    body: [
      "興味づけ（表紙）→信頼（会社）→課題→解決→メリット→条件→CTA。",
      "最初の1ページで「自分ごと」にさせるフックを置く。",
    ].join("\n"),
    kinds: ["sales_material", "proposal"],
  },
  {
    id: "sales.persuasion",
    layer: "deliverable",
    title: "説得順序・見せ方",
    body: [
      "課題共感の後に解決策。機能羅列より便益を先に。",
      "図表・対比・事例で見せる。CTAは具体的な次アクション。",
    ].join("\n"),
    kinds: ["sales_material", "proposal"],
  },
  {
    id: "sales.cta",
    layer: "deliverable",
    title: "CTAルール",
    body: [
      "「ご検討ください」だけで終わらず、面談・デモ・見積など行動を明示。",
      "連絡手段とタイミングの目安があるとよい。",
    ].join("\n"),
    kinds: ["sales_material", "proposal"],
  },
];
