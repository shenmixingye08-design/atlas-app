import type { ImageAnalysisResult } from "@/lib/image-analysis/types";

/** Supported downloadable deliverable formats. */
export type DeliverableFormat =
  | "pdf"
  | "docx"
  | "pptx"
  | "xlsx"
  | "md"
  | "txt"
  | "csv";

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
  /** Structured image analysis — preferred source for Excel/CSV. */
  imageAnalysis?: ImageAnalysisResult | null;
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
  xlsx: "Excel (.xlsx)",
  md: "Markdown (.md)",
  txt: "テキスト (.txt)",
  csv: "CSV (.csv)",
};

export const DELIVERABLE_MIME_TYPES: Record<DeliverableFormat, string> = {
  pdf: "application/pdf",
  docx:
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx:
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  md: "text/markdown; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
};

export const DELIVERABLE_EXTENSIONS: Record<DeliverableFormat, string> = {
  pdf: ".pdf",
  docx: ".docx",
  pptx: ".pptx",
  xlsx: ".xlsx",
  md: ".md",
  txt: ".txt",
  csv: ".csv",
};

/** Preferred display order on the deliverable screen (default). */
export const DELIVERABLE_DOWNLOAD_ORDER: readonly DeliverableFormat[] = [
  "xlsx",
  "csv",
  "pdf",
  "docx",
  "md",
  "txt",
  "pptx",
] as const;

export const ALL_DELIVERABLE_FORMATS: readonly DeliverableFormat[] = [
  "pdf",
  "docx",
  "pptx",
  "xlsx",
  "md",
  "txt",
  "csv",
] as const;
