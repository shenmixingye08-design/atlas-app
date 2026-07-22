/** Semantic document types — rule-detected, no AI. */
export const DOCUMENT_TYPES = [
  "proposal",
  "plan",
  "report",
  "research",
  "minutes",
  "manual",
  "sales",
  "comparison",
  "estimate",
  "schedule",
  "list",
  "general",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** Visual / layout templates — auto-selected by type, user-overridable without AI. */
export const TEMPLATE_IDS = [
  "business",
  "simple",
  "proposal",
  "report",
  "minutes",
  "manual",
  "comparison",
] as const;

export type TemplateId = (typeof TEMPLATE_IDS)[number];

export const OUTPUT_FORMATS = ["docx", "pdf", "xlsx"] as const;

export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

export const DOCUMENT_MODEL_SCHEMA_VERSION = 1 as const;
