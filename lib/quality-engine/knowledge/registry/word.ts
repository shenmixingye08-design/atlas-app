import type { KnowledgeEntry } from "../types";

export const WORD_KNOWLEDGE: readonly KnowledgeEntry[] = [
  {
    id: "word.layout",
    layer: "deliverable",
    title: "Wordレイアウトルール",
    body: [
      "見出し階層（H1/H2/H3）を崩さない。",
      "余白・段落・箇条書き・表を活用。長い章の前は改ページ推奨を注記可。",
    ].join("\n"),
    kinds: ["word"],
  },
];
