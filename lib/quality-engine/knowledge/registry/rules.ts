import type { KnowledgeEntry } from "../types";

export const RULES_KNOWLEDGE: readonly KnowledgeEntry[] = [
  {
    id: "rules.writing",
    layer: "rules",
    title: "文章ルール",
    body: [
      "一文を長くしすぎない。見出しと箇条書きでスキャンしやすくする。",
      "同じ内容の重複を避ける。プレースホルダ（TODO等）を残さない。",
      "日本語として自然な敬体を基本とする（成果物種別に応じて調整）。",
    ].join("\n"),
  },
  {
    id: "rules.facts",
    layer: "rules",
    title: "事実・整合ルール",
    body: [
      "Business Profile / Vision / 参考資料と矛盾する記述は禁止。",
      "過去成果物は参考のみ — 文言のコピーは禁止。",
      "不明点は推測で埋めず【要確認】。",
    ].join("\n"),
  },
];
