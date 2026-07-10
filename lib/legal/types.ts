export type LegalBlock =
  | { type: "paragraph"; text: string }
  | { type: "bullets"; items: string[] }
  | { type: "subheading"; text: string }
  | { type: "link"; label: string; href: string; description?: string };

export type LegalArticle = {
  /** Anchor id, e.g. "article-1" or "section-1" */
  id: string;
  number: number;
  title: string;
  /** e.g. "①" for privacy sections; defaults to 第{number}条 for terms */
  sectionPrefix?: string;
  blocks: LegalBlock[];
};

export type LegalDocumentMeta = {
  version: string;
  lastUpdated: string;
  lastUpdatedDisplay: string;
  effectiveDateDisplay: string;
};
