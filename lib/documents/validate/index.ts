export type FileValidationResult = {
  valid: boolean;
  format: "docx" | "pdf" | "xlsx";
  sizeBytes: number;
  pageCount?: number;
  sheetCount?: number;
  error?: string;
};

function isZipBuffer(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

export function validateDocxBuffer(buffer: Buffer): FileValidationResult {
  const sizeBytes = buffer.byteLength;
  if (sizeBytes <= 0) {
    return { valid: false, format: "docx", sizeBytes, error: "empty file" };
  }
  if (!isZipBuffer(buffer)) {
    return { valid: false, format: "docx", sizeBytes, error: "not a ZIP/OOXML archive" };
  }
  const text = buffer.toString("latin1");
  if (!text.includes("[Content_Types].xml") && !text.includes("word/")) {
    return { valid: false, format: "docx", sizeBytes, error: "missing Word OOXML parts" };
  }
  return { valid: true, format: "docx", sizeBytes };
}

export function validatePdfBuffer(buffer: Buffer): FileValidationResult {
  const sizeBytes = buffer.byteLength;
  if (sizeBytes <= 0) {
    return { valid: false, format: "pdf", sizeBytes, error: "empty file" };
  }
  const header = buffer.subarray(0, 5).toString("latin1");
  if (!header.startsWith("%PDF")) {
    return { valid: false, format: "pdf", sizeBytes, error: "missing PDF signature" };
  }
  const text = buffer.toString("latin1");
  if (!text.includes("%%EOF")) {
    return { valid: false, format: "pdf", sizeBytes, error: "truncated PDF" };
  }
  const pageMatches = text.match(/\/Type\s*\/Page[^s]/g);
  const pageCount = pageMatches?.length ?? 1;
  return { valid: true, format: "pdf", sizeBytes, pageCount };
}

export async function validateXlsxBuffer(buffer: Buffer): Promise<FileValidationResult> {
  const sizeBytes = buffer.byteLength;
  if (sizeBytes <= 0) {
    return { valid: false, format: "xlsx", sizeBytes, error: "empty file" };
  }
  if (!isZipBuffer(buffer)) {
    return { valid: false, format: "xlsx", sizeBytes, error: "not a ZIP archive" };
  }

  const text = buffer.toString("latin1");
  if (!text.includes("xl/workbook.xml") && !text.includes("xl/worksheets/")) {
    return { valid: false, format: "xlsx", sizeBytes, error: "missing Excel workbook parts" };
  }

  const sheetMatches = text.match(/xl\/worksheets\/sheet\d+\.xml/g);
  const sheetCount = sheetMatches?.length ?? 1;
  if (sheetCount <= 0) {
    return { valid: false, format: "xlsx", sizeBytes, error: "workbook has no sheets" };
  }

  return { valid: true, format: "xlsx", sizeBytes, sheetCount };
}

export async function validateDeliverableBuffer(
  format: "docx" | "pdf" | "xlsx",
  buffer: Buffer,
): Promise<FileValidationResult> {
  switch (format) {
    case "docx":
      return validateDocxBuffer(buffer);
    case "pdf":
      return validatePdfBuffer(buffer);
    case "xlsx":
      return validateXlsxBuffer(buffer);
  }
}
