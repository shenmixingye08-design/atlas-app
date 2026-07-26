import type { KnowledgeEntry } from "../types";

export const BRAND_KNOWLEDGE: readonly KnowledgeEntry[] = [
  {
    id: "brand.tone",
    layer: "brand",
    title: "ブランドトーン",
    body: [
      "丁寧で信頼感のあるビジネストーンを基本とする。",
      "過度な煽り・誇大表現・断定しすぎた効果保証は避ける。",
    ].join("\n"),
  },
  {
    id: "brand.expressions",
    layer: "brand",
    title: "推奨表現 / 禁止表現",
    body: [
      "推奨: 具体・根拠・次のアクションが分かる表現。",
      "禁止: 「絶対」「必ず儲かる」「業界唯一」など根拠なき最上級表現。",
      "禁止: お客様を見下す言い回し、攻撃的な比較。",
    ].join("\n"),
  },
];
