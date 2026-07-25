import type { DocumentIR } from "./types";

/** Render DocumentIR to plain text (Word/PDF/Excel templates use this foundation). */
export function renderDocumentIRToText(ir: DocumentIR): string {
  const lines: string[] = [ir.title];
  if (ir.subtitle) lines.push(ir.subtitle);
  lines.push("");

  for (const section of ir.sections) {
    const prefix = "#".repeat(section.level);
    lines.push(`${prefix} ${section.heading}`);
    for (const paragraph of section.paragraphs) {
      lines.push(paragraph);
    }
    for (const bullet of section.bullets ?? []) {
      lines.push(`- ${bullet}`);
    }
    lines.push("");
  }

  for (const table of ir.tables) {
    if (table.title) lines.push(table.title);
    lines.push(table.headers.join("\t"));
    for (const row of table.rows) {
      lines.push(row.join("\t"));
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

/** Placeholder for template-based binary renderers (docx/pdf/xlsx). */
export function getDocumentTemplateId(documentType: DocumentIR["documentType"]): string {
  return `atlas-doc-${documentType}-v1`;
}
