import type { KnowledgeEntry } from "../types";

export const DESIGN_KNOWLEDGE: readonly KnowledgeEntry[] = [
  {
    id: "design.layout",
    layer: "design",
    title: "デザインルール",
    body: [
      "情報階層を明確に（タイトル→要点→詳細）。",
      "余白と視線誘導を意識し、詰め込みすぎない。",
      "図表・箇条書き・対比表を適切に使い読みやすさを上げる。",
    ].join("\n"),
  },
  {
    id: "design.print",
    layer: "design",
    title: "印刷・ページ",
    body: [
      "PDF/資料は印刷しても読める密度を意識する。",
      "1セクション1メッセージを基本とする。",
    ].join("\n"),
    kinds: ["pdf", "sales_material", "proposal", "planning"],
  },
];
