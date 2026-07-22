import type { ContentBlock } from "../parse-content";

/** Business document types with dedicated section templates. */
export type DocumentType =
  | "plan" // 企画書
  | "proposal" // 提案書
  | "report" // 報告書
  | "sales" // 営業資料
  | "estimate" // 見積・比較資料
  | "minutes" // 議事録
  | "manual" // 手順書・マニュアル
  | "research" // 調査レポート
  | "general"; // 一般文書

/** Visual design presets for Word/PDF rendering. */
export type DesignTemplateId = "standard" | "simple" | "business" | "report";

export const DESIGN_TEMPLATE_IDS: readonly DesignTemplateId[] = [
  "standard",
  "simple",
  "business",
  "report",
] as const;

export const DEFAULT_DESIGN_TEMPLATE: DesignTemplateId = "business";

export type DocumentBlock =
  | ContentBlock
  | { type: "callout"; variant: "note" | "important" | "warning"; text: string }
  | { type: "keyCard"; title: string; items: string[] };

export type DocumentSection = {
  /** Stable role key used for ordering (e.g. summary, actions). */
  role: string;
  title: string;
  level: 1 | 2 | 3;
  blocks: DocumentBlock[];
  /** Major chapter break before this section (cover excluded). */
  pageBreakBefore?: boolean;
};

export type DocumentMeta = {
  createdAtLabel: string;
  authorLabel: string;
  documentTypeLabel: string;
  /** Extra typed fields (minutes date, attendees, etc.). */
  fields: Array<{ label: string; value: string }>;
};

export type StructuredDocument = {
  documentType: DocumentType;
  designTemplate: DesignTemplateId;
  title: string;
  subtitle?: string;
  meta: DocumentMeta;
  sections: DocumentSection[];
  includeTableOfContents: boolean;
  /** True when at least one table is wide enough to prefer landscape PDF pages. */
  preferLandscapeTables: boolean;
};

export type BuildStructuredDocumentInput = {
  content: string;
  assignment?: string;
  title?: string;
  designTemplate?: DesignTemplateId;
  authorLabel?: string;
};
