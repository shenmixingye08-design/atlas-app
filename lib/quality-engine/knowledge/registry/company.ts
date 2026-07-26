import type { KnowledgeEntry } from "../types";

/** 会社独自ナレッジ（デフォルト骨格 — metadata/profile で上書き拡張）. */
export const COMPANY_KNOWLEDGE: readonly KnowledgeEntry[] = [
  {
    id: "company.overview",
    layer: "company",
    title: "会社概要",
    body: [
      "会社名・事業領域・強みを Business Profile と矛盾なく記載する。",
      "実績数値は Profile / 参考資料にあるものだけ使い、捏造しない。",
    ].join("\n"),
  },
  {
    id: "company.services",
    layer: "company",
    title: "サービス情報",
    body: [
      "提供サービス・対象顧客・提供価値を明確にする。",
      "未確認の価格・納期は【要確認】とする。",
    ].join("\n"),
  },
];
