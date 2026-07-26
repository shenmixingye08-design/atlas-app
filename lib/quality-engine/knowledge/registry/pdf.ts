import type { KnowledgeEntry } from "../types";

export const PDF_KNOWLEDGE: readonly KnowledgeEntry[] = [
  {
    id: "pdf.pages",
    layer: "deliverable",
    title: "ページ構成・印刷品質",
    body: [
      "表紙→本文→まとめ。印刷しても読める余白と文字量。",
      "1ページ相当の塊を意識し、図表にキャプションを付ける。",
    ].join("\n"),
    kinds: ["pdf"],
  },
];
