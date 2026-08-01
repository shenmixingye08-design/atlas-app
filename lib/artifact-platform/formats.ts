import type { DeliverableFormat } from "@/lib/deliverables/types";
import {
  DELIVERABLE_MIME_TYPES,
  getDeliverableExtension,
} from "@/lib/deliverables/types";
import type { ArtifactFormat, ConversionQuality } from "./types";

export const ARTIFACT_FORMATS: ArtifactFormat[] = [
  "docx",
  "xlsx",
  "pdf",
  "pptx",
  "csv",
  "png",
  "jpg",
  "json",
  "markdown",
  "md",
  "txt",
];

export function normalizeArtifactFormat(raw: string | null | undefined): ArtifactFormat | null {
  if (!raw) return null;
  const v = raw.toLowerCase().trim();
  if (v === "markdown") return "md";
  if (v === "jpeg") return "jpg";
  if ((ARTIFACT_FORMATS as string[]).includes(v)) return v as ArtifactFormat;
  return null;
}

export function toDeliverableFormat(format: ArtifactFormat): DeliverableFormat {
  if (format === "markdown") return "md";
  if (format === "json") return "txt";
  return format as DeliverableFormat;
}

export function mimeForArtifactFormat(format: ArtifactFormat): string {
  switch (format) {
    case "docx":
      return DELIVERABLE_MIME_TYPES.docx;
    case "xlsx":
      return DELIVERABLE_MIME_TYPES.xlsx;
    case "pdf":
      return DELIVERABLE_MIME_TYPES.pdf;
    case "pptx":
      return DELIVERABLE_MIME_TYPES.pptx;
    case "csv":
      return "text/csv; charset=utf-8";
    case "png":
      return "image/png";
    case "jpg":
      return "image/jpeg";
    case "json":
      return "application/json; charset=utf-8";
    case "markdown":
    case "md":
      return DELIVERABLE_MIME_TYPES.md;
    case "txt":
      return DELIVERABLE_MIME_TYPES.txt;
    default:
      return "application/octet-stream";
  }
}

export function extensionForArtifactFormat(format: ArtifactFormat): string {
  if (format === "csv") return "csv";
  if (format === "png") return "png";
  if (format === "jpg") return "jpg";
  if (format === "markdown") return "md";
  try {
    return getDeliverableExtension(toDeliverableFormat(format));
  } catch {
    return format;
  }
}

export function labelForFormat(format: ArtifactFormat): string {
  switch (format) {
    case "docx":
      return "Word";
    case "xlsx":
      return "Excel";
    case "pdf":
      return "PDF";
    case "pptx":
      return "PowerPoint";
    case "csv":
      return "CSV";
    case "png":
    case "jpg":
      return "画像";
    case "json":
      return "JSON";
    case "md":
    case "markdown":
      return "Markdown";
    case "txt":
      return "テキスト";
    default:
      return format;
  }
}

/** Conversion matrix: quality for each source→target pair we claim support for. */
export const CONVERSION_MATRIX: Record<
  string,
  { quality: ConversionQuality; asyncPreferred: boolean; engine: string }
> = {
  "docx->pdf": { quality: "high", asyncPreferred: false, engine: "document-restructure-pdf" },
  "xlsx->pdf": { quality: "needs_review", asyncPreferred: false, engine: "sheet-summary-pdf" },
  "pptx->pdf": { quality: "needs_review", asyncPreferred: false, engine: "pptx-structure-pdf" },
  "pdf->docx": { quality: "needs_review", asyncPreferred: true, engine: "pdf-text-to-docx" },
  "pdf->xlsx": { quality: "low_confidence", asyncPreferred: true, engine: "pdf-table-heuristic-xlsx" },
  "pdf->png": { quality: "unsupported", asyncPreferred: false, engine: "none" },
  "pdf->jpg": { quality: "unsupported", asyncPreferred: false, engine: "none" },
  "docx->pptx": { quality: "needs_review", asyncPreferred: true, engine: "pptx-secretary-from-word" },
  "xlsx->pptx": { quality: "needs_review", asyncPreferred: true, engine: "pptx-secretary-from-excel" },
  "pdf->pptx": { quality: "low_confidence", asyncPreferred: true, engine: "pptx-secretary-from-pdf" },
  "csv->xlsx": { quality: "high", asyncPreferred: false, engine: "excel-secretary-csv" },
  "xlsx->csv": { quality: "high", asyncPreferred: false, engine: "sheetjs-csv" },
  "png->pdf": { quality: "high", asyncPreferred: false, engine: "image-embed-pdf" },
  "jpg->pdf": { quality: "high", asyncPreferred: false, engine: "image-embed-pdf" },
  "png->xlsx": { quality: "low_confidence", asyncPreferred: true, engine: "vision-to-excel" },
  "jpg->xlsx": { quality: "low_confidence", asyncPreferred: true, engine: "vision-to-excel" },
  "png->docx": { quality: "low_confidence", asyncPreferred: true, engine: "vision-to-word" },
  "jpg->docx": { quality: "low_confidence", asyncPreferred: true, engine: "vision-to-word" },
};

export function conversionKey(from: ArtifactFormat, to: ArtifactFormat): string {
  const a = from === "markdown" ? "md" : from;
  const b = to === "markdown" ? "md" : to;
  return `${a}->${b}`;
}

export function getConversionMeta(from: ArtifactFormat, to: ArtifactFormat) {
  return (
    CONVERSION_MATRIX[conversionKey(from, to)] ?? {
      quality: "unsupported" as ConversionQuality,
      asyncPreferred: false,
      engine: "none",
    }
  );
}

export function qualityLabel(quality: ConversionQuality): string {
  switch (quality) {
    case "high":
      return "高品質";
    case "needs_review":
      return "一部要確認";
    case "low_confidence":
      return "低信頼";
    case "unsupported":
      return "非対応";
    default:
      return quality;
  }
}

export function listSupportedConversions(from?: ArtifactFormat) {
  return Object.entries(CONVERSION_MATRIX)
    .filter(([, v]) => v.quality !== "unsupported")
    .map(([key, v]) => {
      const [source, target] = key.split("->");
      return { source, target, ...v, qualityLabel: qualityLabel(v.quality) };
    })
    .filter((row) => (from ? row.source === from : true));
}

/** Auto format suggestion from request text (no AI). */
export function suggestFormatsFromRequest(text: string): {
  primary: ArtifactFormat;
  secondary: ArtifactFormat[];
  confidence: number;
  reason: string;
  needsConfirmation: boolean;
} {
  const t = text.toLowerCase();
  if (/議事録|meeting\s*minutes|打ち合わせメモ/.test(t)) {
    return {
      primary: "docx",
      secondary: ["pdf"],
      confidence: 0.88,
      reason: "議事録は編集用Wordが中心です。",
      needsConfirmation: false,
    };
  }
  if (/売上|家計|台帳|管理表|集計|予算|見積/.test(t)) {
    const multi = /見積/.test(t);
    return {
      primary: "xlsx",
      secondary: multi ? ["pdf"] : [],
      confidence: multi ? 0.82 : 0.9,
      reason: multi
        ? "見積は編集用Excelと提出用PDFの同時生成が適しています。"
        : "表計算・管理はExcelが適しています。",
      needsConfirmation: multi,
    };
  }
  if (/提出|報告書|レポート.*提出|正式文書/.test(t)) {
    return {
      primary: "pdf",
      secondary: ["docx"],
      confidence: 0.8,
      reason: "提出用はPDF、編集用にWordも候補です。",
      needsConfirmation: true,
    };
  }
  if (/営業|プレゼン|説明資料|ピッチ|スライド/.test(t)) {
    return {
      primary: "pptx",
      secondary: ["pdf"],
      confidence: 0.86,
      reason: "説明資料はPowerPoint＋提出用PDFが適しています。",
      needsConfirmation: false,
    };
  }
  if (/csv|受け渡し|データ連携|インポート用/.test(t)) {
    return {
      primary: "csv",
      secondary: ["xlsx"],
      confidence: 0.84,
      reason: "データ受け渡しはCSV、確認用にExcelも候補です。",
      needsConfirmation: true,
    };
  }
  return {
    primary: "docx",
    secondary: [],
    confidence: 0.45,
    reason: "形式の手がかりが少ないため、確認をおすすめします。",
    needsConfirmation: true,
  };
}
