import type { KnowledgeEntry } from "../types";

export const BLOG_KNOWLEDGE: readonly KnowledgeEntry[] = [
  {
    id: "blog.seo",
    layer: "deliverable",
    title: "SEOルール",
    body: [
      "検索意図に先に答える。SEO title / description / tags を埋める。",
      "見出しはスキャンしやすく、キーワードを自然に含める。",
    ].join("\n"),
    kinds: ["blog"],
  },
  {
    id: "blog.headings",
    layer: "deliverable",
    title: "見出し・構成",
    body: [
      "導入→本文（H2中心）→具体例→まとめ。",
      "まとめに次の一歩を入れる。",
    ].join("\n"),
    kinds: ["blog"],
  },
];
