import type { DocumentIR, DocumentSection, DocumentType } from "./types";

const HEADING_RE = /^(#{1,3})\s+(.+)$/;
const BULLET_RE = /^[-*•]\s+(.+)$/;

function inferDocumentType(text: string): DocumentType {
  if (/議事録|会議/.test(text)) return "minutes";
  if (/提案|企画/.test(text)) return "proposal";
  if (/手順|マニュアル|操作/.test(text)) return "procedure";
  if (/報告|レポート|分析/.test(text)) return "report";
  if (/ビジネス|提案書|企画書/.test(text)) return "business";
  return "simple";
}

/** Rule-based parser for plain text legacy AI output. */
export function parseLegacyDocumentText(text: string): DocumentIR {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const sections: DocumentSection[] = [];
  let current: DocumentSection | null = null;
  let title = "資料";

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const headingMatch = line.match(HEADING_RE);
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3;
      const heading = headingMatch[2].trim();
      if (!current && sections.length === 0) {
        title = heading;
      }
      current = { heading, level, paragraphs: [], bullets: [] };
      sections.push(current);
      continue;
    }

    const bulletMatch = line.match(BULLET_RE);
    if (bulletMatch) {
      if (!current) {
        current = { heading: "本文", level: 2, paragraphs: [], bullets: [] };
        sections.push(current);
      }
      current.bullets = current.bullets ?? [];
      current.bullets.push(bulletMatch[1].trim());
      continue;
    }

    if (!current) {
      current = { heading: "本文", level: 2, paragraphs: [], bullets: [] };
      sections.push(current);
    }
    current.paragraphs.push(line);
  }

  return {
    documentType: inferDocumentType(text),
    title,
    sections,
    tables: [],
  };
}

/** Normalize structured JSON (already parsed) into DocumentIR. */
export function normalizeDocumentIR(input: unknown): DocumentIR | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as Partial<DocumentIR>;
  if (!obj.title || !Array.isArray(obj.sections)) return null;

  return {
    documentType: obj.documentType ?? "simple",
    title: obj.title,
    subtitle: obj.subtitle,
    sections: obj.sections,
    tables: obj.tables ?? [],
    metadata: obj.metadata,
  };
}
