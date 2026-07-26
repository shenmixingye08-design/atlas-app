import "server-only";

import ExcelJS from "exceljs";
import mammoth from "mammoth";

import { extractTextFromPdfBuffer } from "@/lib/documents/extract-pdf-text";

import { DOCUMENT_ATTACHMENT_LIMITS } from "./types";

function decodeTextBuffer(buffer: Buffer): string {
  // Prefer UTF-8; fall back to shift_jis-ish latin1 cleanup for JP CSV.
  const utf8 = buffer.toString("utf8");
  if (!utf8.includes("\uFFFD")) return utf8;
  return buffer.toString("latin1");
}

async function extractDocx(buffer: Buffer): Promise<{
  text: string;
  pageOrSheetCount: null;
}> {
  const result = await mammoth.extractRawText({ buffer });
  return { text: result.value ?? "", pageOrSheetCount: null };
}

async function extractXlsx(buffer: Buffer): Promise<{
  text: string;
  pageOrSheetCount: number;
}> {
  const workbook = new ExcelJS.Workbook();
  // exceljs accepts Node Buffer at runtime; cast keeps typings satisfied across versions.
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const parts: string[] = [];
  let sheets = 0;
  workbook.eachSheet((sheet) => {
    sheets += 1;
    parts.push(`【シート: ${sheet.name}】`);
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const values = Array.isArray(row.values)
        ? row.values
            .slice(1)
            .map((cell) => {
              if (cell == null) return "";
              if (typeof cell === "object" && "result" in cell) {
                return String((cell as { result?: unknown }).result ?? "");
              }
              if (typeof cell === "object" && "text" in cell) {
                return String((cell as { text?: unknown }).text ?? "");
              }
              return String(cell);
            })
            .join("\t")
        : "";
      if (values.trim()) parts.push(`${rowNumber}\t${values}`);
    });
  });
  return { text: parts.join("\n"), pageOrSheetCount: sheets };
}

async function extractCsv(buffer: Buffer): Promise<{
  text: string;
  pageOrSheetCount: null;
}> {
  return { text: decodeTextBuffer(buffer), pageOrSheetCount: null };
}

/**
 * Extract plain text from supported document bytes.
 * Image-based / scanned PDFs may yield little text — caller should fall back to vision.
 */
export async function extractDocumentText(input: {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<{
  text: string;
  pageOrSheetCount: number | null;
  warnings: string[];
}> {
  const mime = input.mimeType.toLowerCase();
  const ext = input.fileName.split(".").pop()?.toLowerCase() ?? "";
  const warnings: string[] = [];

  let text = "";
  let pageOrSheetCount: number | null = null;

  try {
    if (mime === "application/pdf" || ext === "pdf") {
      text = extractTextFromPdfBuffer(input.buffer);
      if (text.trim().length < 40) {
        warnings.push(
          "PDFから十分なテキストを抽出できませんでした。スキャンPDFの場合は画像として添付してください。",
        );
      }
    } else if (
      mime.includes("wordprocessingml") ||
      ext === "docx" ||
      mime === "application/msword" ||
      ext === "doc"
    ) {
      if (ext === "doc" || mime === "application/msword") {
        warnings.push(
          "旧形式の .doc は限定対応です。可能なら .docx に変換してください。",
        );
      }
      const extracted = await extractDocx(input.buffer);
      text = extracted.text;
      pageOrSheetCount = extracted.pageOrSheetCount;
    } else if (
      mime.includes("spreadsheetml") ||
      ext === "xlsx" ||
      mime === "application/vnd.ms-excel" ||
      ext === "xls"
    ) {
      if (ext === "xls" || mime === "application/vnd.ms-excel") {
        // exceljs primarily supports xlsx; attempt load and warn.
        warnings.push(
          "旧形式の .xls は限定対応です。可能なら .xlsx に変換してください。",
        );
      }
      const extracted = await extractXlsx(input.buffer);
      text = extracted.text;
      pageOrSheetCount = extracted.pageOrSheetCount;
    } else if (mime.includes("csv") || ext === "csv") {
      const extracted = await extractCsv(input.buffer);
      text = extracted.text;
    } else if (
      mime.includes("presentationml") ||
      ext === "pptx" ||
      mime === "application/vnd.ms-powerpoint" ||
      ext === "ppt"
    ) {
      // Best-effort: unzip XML text nodes via latin1 scan (no PPTX parser dep).
      const raw = input.buffer.toString("utf8");
      const matches = raw.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) ?? [];
      text = matches
        .map((m) => m.replace(/<\/?a:t[^>]*>/g, ""))
        .join("\n");
      if (!text.trim()) {
        warnings.push("PowerPointからテキストを抽出できませんでした。");
      }
    } else if (mime.startsWith("text/") || ext === "txt" || ext === "rtf") {
      text = decodeTextBuffer(input.buffer);
    } else {
      throw new Error("unsupported_file_type");
    }
  } catch (error) {
    if (error instanceof Error && error.message === "unsupported_file_type") {
      throw error;
    }
    throw new Error("document_parse_failed");
  }

  const clipped = text
    .replace(/\u0000/g, "")
    .slice(0, DOCUMENT_ATTACHMENT_LIMITS.maxExtractedChars);

  if (!clipped.trim()) {
    warnings.push("ファイルから読み取れるテキストがありませんでした。");
  }

  return { text: clipped, pageOrSheetCount, warnings };
}
