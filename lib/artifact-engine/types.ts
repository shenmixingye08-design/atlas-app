import type { DocumentType } from "@/lib/deliverables/document-model";
import type { DeliverableFormat } from "@/lib/deliverables/types";

import type { ArtifactDocument } from "./document";
import type { ArtifactTemplateId } from "./templates/types";

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
  | "estimate"
  | "minutes"
  | "ranking"
  | "list"
  | "household"
  | "schedule"
  | "research"
  | "manual"
  | "blog"
  | "sns"
  | "youtube_script"
  | "presentation"
  | "general";

export const ARTIFACT_TYPE_LABELS: Record<ArtifactType, string> = {
  sales_material: "営業資料",
  proposal: "提案書",
  plan: "企画書",
  report: "報告書",
  contract: "契約書",
  invoice: "請求書",
  estimate: "見積書",
  minutes: "議事録",
  ranking: "ランキング",
  list: "一覧表",
  household: "家計簿",
  schedule: "スケジュール",
  research: "調査レポート",
  manual: "手順書",
  blog: "ブログ記事",
  sns: "SNS投稿",
  youtube_script: "YouTube台本",
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
  | "drive"
  | "quality_gap";

export type ArtifactSuggestion = {
  id: string;
  kind: ArtifactSuggestionKind;
  title: string;
  message: string;
  /** Optional primary action label shown in UI. */
  actionLabel?: string;
  /** Soft priority — higher first. */
  priority: number;
  fieldKeys?: string[];
};

export type ArtifactFormatPlan = {
  formats: DeliverableFormat[];
  recommended: DeliverableFormat[];
  other: DeliverableFormat[];
  matchedRule: string;
};

export type ArtifactDetection = {
  artifactType: ArtifactType;
  label: string;
  documentType: DocumentType;
  formatPlan: ArtifactFormatPlan;
  designTemplate: ArtifactTemplateId;
  templateLabel: string;
  /** True when content looks table-shaped enough for Excel. */
  excelRecommended: boolean;
  excelNotApplicable?: boolean;
  excelNotApplicableReason?: string;
};

export type ArtifactPreviewBlock =
  | { type: "paragraph"; text: string }
  | { type: "bulletList"; items: string[] }
  | { type: "numberedList"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][]; caption?: string }
  | { type: "callout"; variant: "note" | "important" | "warning"; text: string }
  | { type: "imagePlaceholder"; caption: string }
  | { type: "keyCard"; title: string; items: string[] }
  | { type: "contact"; fields: Array<{ label: string; value: string }> }
  | { type: "signature"; lines: string[] }
  | { type: "pageBreak" };

export type ArtifactPreviewSection = {
  title: string;
  level: 1 | 2 | 3;
  blocks: ArtifactPreviewBlock[];
  pageBreakBefore?: boolean;
};

/** Fully rendered preview model — never raw Markdown. */
export type ArtifactPreviewModel = {
  artifactType: ArtifactType;
  artifactLabel: string;
  documentTypeLabel: string;
  templateLabel: string;
  designId: ArtifactTemplateId;
  title: string;
  subtitle?: string;
  summary?: string;
  metaFields: Array<{ label: string; value: string }>;
  toc: string[];
  showCover: boolean;
  showHeader: boolean;
  showFooter: boolean;
  showPageNumbers: boolean;
  sections: ArtifactPreviewSection[];
  completionStatus: ArtifactDocument["completionStatus"];
};
