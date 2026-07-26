import type { KnowledgeEntry } from "../types";

export const EXCEL_KNOWLEDGE: readonly KnowledgeEntry[] = [
  {
    id: "excel.table",
    layer: "deliverable",
    title: "表作成ルール",
    body: [
      "列構成を先に定義し、テーブル化できる行データを用意する。",
      "数式例と計算前提を明記。ヘッダ以外のセル結合は避ける。",
      "色分け・区分の指針を書く。",
    ].join("\n"),
    kinds: ["excel"],
  },
];
