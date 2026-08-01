import type { AttachmentMeta, SourceInput, SourceInputType } from "./types";

function inferType(meta: AttachmentMeta): SourceInputType {
  if (meta.kindHint) return meta.kindHint;
  const mime = (meta.mimeType ?? "").toLowerCase();
  const name = (meta.fileName ?? "").toLowerCase();

  if (mime.startsWith("image/") || /\.(png|jpe?g|webp|gif|heic)$/i.test(name)) {
    return "image";
  }
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (
    mime.includes("wordprocessingml") ||
    name.endsWith(".docx") ||
    name.endsWith(".doc")
  ) {
    return "docx";
  }
  if (
    mime.includes("spreadsheetml") ||
    name.endsWith(".xlsx") ||
    name.endsWith(".xls")
  ) {
    return "xlsx";
  }
  if (
    mime.includes("presentationml") ||
    name.endsWith(".pptx") ||
    name.endsWith(".ppt")
  ) {
    return "pptx";
  }
  if (mime === "text/csv" || name.endsWith(".csv")) return "csv";
  return "text";
}

function defaultRole(type: SourceInputType, assignment: string): string {
  const text = assignment;
  if (type === "image") {
    if (/レシート|領収/.test(text)) return "receipt_image";
    if (/表|一覧|excel|エクセル|家計簿/.test(text)) return "table_image";
    if (/名刺/.test(text)) return "business_card";
    return "visual_source";
  }
  if (type === "pdf") {
    if (/要約|解析|抽出|分析/.test(text)) return "analysis_source";
    if (/にして|変換|pdfに/.test(text)) return "conversion_source";
    return "document_source";
  }
  if (type === "xlsx" || type === "csv") {
    if (/pdf|ワード|word|pptx|変換/.test(text)) return "conversion_source";
    if (/編集|直して|更新/.test(text)) return "edit_source";
    return "data_source";
  }
  if (type === "docx") {
    if (/pdf|変換/.test(text)) return "conversion_source";
    if (/編集|直して/.test(text)) return "edit_source";
    return "document_source";
  }
  return "source";
}

/** Map uploaded files into structured source_inputs. */
export function buildSourceInputs(
  assignment: string,
  attachments: readonly AttachmentMeta[] | undefined,
): SourceInput[] {
  const inputs: SourceInput[] = [
    {
      type: "text",
      reference: "assignment",
      role: "user_instruction",
      confidence: 1,
    },
  ];

  for (const [index, meta] of (attachments ?? []).entries()) {
    const type = inferType(meta);
    inputs.push({
      type,
      reference: meta.id?.trim() || `attachment_${index + 1}`,
      role: defaultRole(type, assignment),
      mimeType: meta.mimeType,
      fileName: meta.fileName,
      byteLength: meta.byteLength,
      confidence: meta.fileName || meta.mimeType ? 0.85 : 0.55,
    });
  }

  return inputs;
}

export function hasImageSource(inputs: readonly SourceInput[]): boolean {
  return inputs.some((i) => i.type === "image");
}

export function hasFileSource(inputs: readonly SourceInput[]): boolean {
  return inputs.some((i) => i.type !== "text" && i.type !== "url" && i.type !== "external_service");
}

export function primaryFileSource(
  inputs: readonly SourceInput[],
): SourceInput | null {
  return (
    inputs.find(
      (i) =>
        i.type !== "text" &&
        i.type !== "url" &&
        i.type !== "external_service",
    ) ?? null
  );
}

/** Deictic short requests like 「これExcel」「これをPDFに」. */
export function isDeicticRequest(assignment: string): boolean {
  return /^(これ|それ|添付|このファイル|この画像|この表)/.test(assignment.trim()) ||
    /これを|それを|添付を|添付から|この画像を|この表を|このPDF|このExcel|このエクセル/.test(
      assignment,
    );
}
