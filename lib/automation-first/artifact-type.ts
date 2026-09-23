/**
 * Infer a deliverable's file type from its label (e.g. "週次レポート.xlsx").
 * Label-only: no extra API field or fetch is needed.
 */
export type ArtifactFileType = "docx" | "xlsx" | "pdf" | "pptx" | "other";

const EXTENSION_TYPES: Record<string, ArtifactFileType> = {
  docx: "docx",
  doc: "docx",
  xlsx: "xlsx",
  xls: "xlsx",
  csv: "xlsx",
  pdf: "pdf",
  pptx: "pptx",
  ppt: "pptx",
};

export function artifactFileTypeFromLabel(label: string | null | undefined): ArtifactFileType {
  const match = /\.([a-z0-9]{2,5})\s*$/i.exec(label ?? "");
  if (!match) return "other";
  return EXTENSION_TYPES[match[1].toLowerCase()] ?? "other";
}

export const ARTIFACT_TYPE_LABEL: Record<ArtifactFileType, string> = {
  docx: "Word",
  xlsx: "Excel",
  pdf: "PDF",
  pptx: "PowerPoint",
  other: "成果物",
};
