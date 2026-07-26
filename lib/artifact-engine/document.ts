import type { DeliverableFormat } from "@/lib/deliverables/types";

import type { ArtifactType } from "./types";
import type { ArtifactTemplateId, TemplateCategory } from "./templates/types";

/** Shared IR — screen / Word / PDF / Excel / PPTX all render from this. */
export type ArtifactBlock =
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

export type ArtifactSection = {
  role: string;
  title: string;
  level: 1 | 2 | 3;
  blocks: ArtifactBlock[];
  pageBreakBefore?: boolean;
};

export type ArtifactStructurePlan = {
  cover: boolean;
  toc: boolean;
  summary: boolean;
  tables: boolean;
  imageFrames: boolean;
  charts: boolean;
  notes: boolean;
  contact: boolean;
  signature: boolean;
  pageNumbers: boolean;
  header: boolean;
  footer: boolean;
  pageBreaks: boolean;
  cta: boolean;
  /** Estimated pages for TOC heuristics. */
  estimatedPages: number;
  headingCount: number;
};

export type ArtifactFormatStatus =
  | "ready"
  | "generating"
  | "failed"
  | "not_applicable"
  | "pending";

export type ArtifactFormatState = {
  format: DeliverableFormat;
  status: ArtifactFormatStatus;
  label: string;
  purpose: string;
  recommended: boolean;
  error?: string;
  downloadUrl?: string;
  fileName?: string;
};

export type ArtifactCompletionStatus =
  | "ready"
  | "needs_input"
  | "partial"
  | "failed";

export type ArtifactMissingField = {
  key: string;
  label: string;
  /** Hint for input placeholder. */
  placeholder?: string;
  requiredFor: ArtifactType[];
};

/** Canonical artifact document used by all renderers. */
export type ArtifactDocument = {
  title: string;
  subtitle?: string;
  summary?: string;
  artifactType: ArtifactType;
  artifactLabel: string;
  templateId: ArtifactTemplateId;
  templateCategory: TemplateCategory;
  templateLabel: string;
  designId: ArtifactTemplateId;
  structure: ArtifactStructurePlan;
  sections: ArtifactSection[];
  tables: Array<{ title?: string; headers: string[]; rows: string[][] }>;
  images: Array<{ caption: string }>;
  callouts: Array<{ variant: "note" | "important" | "warning"; text: string }>;
  metadata: {
    createdAtLabel: string;
    authorLabel: string;
    fields: Array<{ label: string; value: string }>;
  };
  recommendedFormats: DeliverableFormat[];
  otherFormats: DeliverableFormat[];
  formatStates: ArtifactFormatState[];
  completionStatus: ArtifactCompletionStatus;
  missingFields: ArtifactMissingField[];
  /** True when Excel was requested but content is not tabular. */
  excelNotApplicable?: boolean;
  excelNotApplicableReason?: string;
};
