/** Supported downloadable deliverable formats (v1). */
export type DeliverableFormat = "pdf" | "docx" | "pptx" | "md" | "txt" | "xlsx";

/** ISO timestamp string. */
export type DeliverableTimestamp = string;

/** Metadata returned to the client after server-side generation. */
export interface Deliverable {
  id: string;
  fileName: string;
  format: DeliverableFormat;
  mimeType: string;
  generatedAt: DeliverableTimestamp;
  sizeBytes: number;
  /** True when a stub generator was used — swap for production implementation. */
  isPlaceholder: boolean;
  downloadUrl: string;
}

/** Input to the deliverables engine. */
export type GenerateDeliverablesInput = {
  assignment: string;
  finalDeliverable: string;
  title?: string;
  /** When set, only these formats are generated (skips auto-detection). */
  formats?: DeliverableFormat[];
};

/** Result of format detection. */
export type DeliverableFormatDetection = {
  formats: DeliverableFormat[];
  matchedRule: string | null;
};

/** Binary payload produced by a generator. */
export type GeneratedDeliverableFile = {
  format: DeliverableFormat;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  isPlaceholder: boolean;
};

/** Generator contract — replace placeholders with production libraries later. */
export interface DeliverableGenerator {
  readonly format: DeliverableFormat;
  generate(
    content: string,
    baseFileName: string,
  ): Promise<GeneratedDeliverableFile>;
}

export const DELIVERABLE_FORMAT_LABELS: Record<DeliverableFormat, string> = {
  pdf: "PDF",
  docx: "Word (.docx)",
  pptx: "PowerPoint (.pptx)",
  md: "Markdown (.md)",
  txt: "テキスト (.txt)",
  xlsx: "Excel (.xlsx)",
};

export const DELIVERABLE_MIME_TYPES: Record<DeliverableFormat, string> = {
  pdf: "application/pdf",
  docx:
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx:
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  md: "text/markdown; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export const DELIVERABLE_EXTENSIONS: Record<DeliverableFormat, string> = {
  pdf: ".pdf",
  docx: ".docx",
  pptx: ".pptx",
  md: ".md",
  txt: ".txt",
  xlsx: ".xlsx",
};
