/** Document Intermediate Representation — normalize AI output once. */

export type DocumentType =
  | "business"
  | "simple"
  | "report"
  | "proposal"
  | "minutes"
  | "procedure";

export type DocumentSection = {
  heading: string;
  level: 1 | 2 | 3;
  paragraphs: string[];
  bullets?: string[];
};

export type DocumentTable = {
  title?: string;
  headers: string[];
  rows: string[][];
};

export type DocumentIR = {
  documentType: DocumentType;
  title: string;
  subtitle?: string;
  sections: DocumentSection[];
  tables: DocumentTable[];
  metadata?: Record<string, string>;
};

export type RenderFormat = "docx" | "pdf" | "xlsx";
