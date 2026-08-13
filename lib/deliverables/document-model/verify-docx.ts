import JSZip from "jszip";

export type DocxVerifyReason =
  | "invalid_zip"
  | "docx_reopen_failed"
  | "missing_document"
  | "missing_styles"
  | "missing_relationships"
  | "missing_content_types"
  | "empty_body"
  | "english_chrome"
  | "memory_instruction_leak";

export type DocxVerifyResult = {
  ok: boolean;
  reasons: DocxVerifyReason[];
  paragraphCount: number;
  headingCount: number;
  tableCount: number;
  imageCount: number;
  hasStyles: boolean;
  hasDocument: boolean;
  pageNumberField: boolean;
};

function extractText(xml: string): string {
  return [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)]
    .map((match) => match[1] ?? "")
    .join("");
}

/**
 * Re-open a generated .docx and fail closed on corrupt / empty files.
 */
export async function verifyDocxDocument(buffer: Buffer): Promise<DocxVerifyResult> {
  const reasons: DocxVerifyReason[] = [];
  if (buffer.subarray(0, 2).toString("latin1") !== "PK") {
    return {
      ok: false,
      reasons: ["invalid_zip"],
      paragraphCount: 0,
      headingCount: 0,
      tableCount: 0,
      imageCount: 0,
      hasStyles: false,
      hasDocument: false,
      pageNumberField: false,
    };
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return {
      ok: false,
      reasons: ["docx_reopen_failed"],
      paragraphCount: 0,
      headingCount: 0,
      tableCount: 0,
      imageCount: 0,
      hasStyles: false,
      hasDocument: false,
      pageNumberField: false,
    };
  }

  const documentXml = (await zip.file("word/document.xml")?.async("string")) ?? "";
  const stylesXml = (await zip.file("word/styles.xml")?.async("string")) ?? "";
  const relsXml =
    (await zip.file("word/_rels/document.xml.rels")?.async("string")) ?? "";
  const contentTypes =
    (await zip.file("[Content_Types].xml")?.async("string")) ?? "";
  const hasDocument = documentXml.includes("<w:document");
  const hasStyles = stylesXml.includes("<w:styles");
  if (!hasDocument) reasons.push("missing_document");
  if (!hasStyles) reasons.push("missing_styles");
  if (!relsXml.includes("Relationship")) reasons.push("missing_relationships");
  if (!contentTypes.includes("ContentType")) reasons.push("missing_content_types");

  const text = extractText(documentXml);
  const paragraphCount = (documentXml.match(/<w:p[ >]/g) ?? []).length;
  const headingCount = (documentXml.match(/Heading[123]|heading [123]/g) ?? []).length;
  const tableCount = (documentXml.match(/<w:tbl[ >]/g) ?? []).length;
  const imageCount = Object.keys(zip.files).filter((path) =>
    /^word\/media\//i.test(path),
  ).length;
  if (text.replace(/\s+/g, "").length < 8) reasons.push("empty_body");
  if (/\bKey points\b|\bOverview\b|\bThank you\b/i.test(text)) {
    reasons.push("english_chrome");
  }
  if (/【好み反映】|【適用する好み】|【文体】/.test(text)) {
    reasons.push("memory_instruction_leak");
  }

  const footerXml = await Promise.all(
    Object.keys(zip.files)
      .filter((path) => /^word\/footer\d+\.xml$/i.test(path))
      .map((path) => zip.file(path)?.async("string") ?? Promise.resolve("")),
  );
  const pageNumberField = footerXml.some(
    (xml) => xml.includes("PAGE") || xml.includes("NUMPAGES"),
  );

  return {
    ok: reasons.length === 0,
    reasons: [...new Set(reasons)],
    paragraphCount,
    headingCount,
    tableCount,
    imageCount,
    hasStyles,
    hasDocument,
    pageNumberField,
  };
}
