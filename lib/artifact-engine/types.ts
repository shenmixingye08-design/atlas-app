import type { DesignTemplateId, DocumentType } from "@/lib/deliverables/document-model";
import type { DeliverableFormat } from "@/lib/deliverables/types";

/**
 * Extensible artifact kinds — add new types here without touching
 * Planner / Deliverable pipeline cores.
 */
export type ArtifactType =
  | "sales_material"
  | "proposal"
  | "plan"
  | "report"
  | "contract"
  | "invoice"
  | "minutes"
  | "ranking"
  | "list"
  | "household"
  | "schedule"
  | "research"
  | "manual"
  | "blog"
  | "sns"
  | "presentation"
  | "general";

export const ARTIFACT_TYPE_LABELS: Record<ArtifactType, string> = {
  sales_material: "営業資料",
  proposal: "提案書",
  plan: "企画書",
  report: "報告書",
  contract: "契約書",
  invoice: "請求書",
  minutes: "議事録",
  ranking: "ランキング",
  list: "一覧表",
  household: "家計簿",
  schedule: "スケジュール",
  research: "調査レポート",
  manual: "手順書",
  blog: "ブログ記事",
  sns: "SNS投稿",
  presentation: "プレゼン資料",
  general: "文書",
};

/** Post-completion assist tips (rule-based — no AI call). */
export type ArtifactSuggestionKind =
  | "excel"
  | "powerpoint"
  | "company_profile"
  | "learning_template"
  | "toc"
  | "table"
  | "drive";

export type ArtifactSuggestion = {
  id: string;
  kind: ArtifactSuggestionKind;
  title: string;
  message: string;
  /** Optional primary action label shown in UI. */
  actionLabel?: string;
  /** Soft priority — higher first. */
  priority: number;
};

export type ArtifactFormatPlan = {
  formats: DeliverableFormat[];
  matchedRule: string;
  /** Formats that are planned but not yet generated (e.g. PowerPoint future). */
  upcomingFormats: Array<"pptx">;
};

export type ArtifactDetection = {
  artifactType: ArtifactType;
  label: string;
  documentType: DocumentType;
  formatPlan: ArtifactFormatPlan;
  designTemplate: DesignTemplateId;
  /** True when content looks table-shaped enough for Excel. */
  excelRecommended: boolean;
};

export type ArtifactPreviewBlock =
  | { type: "paragraph"; text: string }
  | { type: "bulletList"; items: string[] }
  | { type: "numberedList"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "callout"; variant: "note" | "important" | "warning"; text: string }
  | { type: "imagePlaceholder"; caption: string }
  | { type: "keyCard"; title: string; items: string[] };

export type ArtifactPreviewSection = {
  title: string;
  level: 1 | 2 | 3;
  blocks: ArtifactPreviewBlock[];
};

/** Fully rendered preview model — never raw Markdown. */
export type ArtifactPreviewModel = {
  artifactType: ArtifactType;
  artifactLabel: string;
  documentTypeLabel: string;
  title: string;
  subtitle?: string;
  metaFields: Array<{ label: string; value: string }>;
  toc: string[];
  sections: ArtifactPreviewSection[];
};
