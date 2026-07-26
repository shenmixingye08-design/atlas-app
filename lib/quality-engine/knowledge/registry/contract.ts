import type { KnowledgeEntry } from "../types";

export const CONTRACT_KNOWLEDGE: readonly KnowledgeEntry[] = [
  {
    id: "contract.legal",
    layer: "deliverable",
    title: "法務ルール",
    body: [
      "条項漏れを防ぐ（定義・目的・義務・責任・解除・雑則）。",
      "番号整合を保つ。曖昧な義務は避け、不明は【要確認】。",
      "過度な法的断定や特定法域の断言はしない。",
    ].join("\n"),
    kinds: ["contract"],
  },
  {
    id: "contract.order",
    layer: "deliverable",
    title: "条項順序",
    body: [
      "当事者→目的→定義→本体条項→責任/解除→一般条項→署名。",
      "読みやすい法務文章を心がける。",
    ].join("\n"),
    kinds: ["contract"],
  },
];
