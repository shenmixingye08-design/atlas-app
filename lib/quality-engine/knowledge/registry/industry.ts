import type { KnowledgeEntry } from "../types";

/** 業界ナレッジ（汎用骨格 — 業種特化は metadata.industryKnowledge で拡張）. */
export const INDUSTRY_KNOWLEDGE: readonly KnowledgeEntry[] = [
  {
    id: "industry.generic",
    layer: "industry",
    title: "業界ナレッジ",
    body: [
      "読者の業界用語は必要最小限にし、初出で簡潔に説明する。",
      "競合比較は事実ベース。根拠のない優位主張はしない。",
      "規制・コンプライアンスに触れる場合は断定を避け一般論に留める。",
    ].join("\n"),
  },
];
