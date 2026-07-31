import type {
  VisionBatchResult,
  VisionDocumentBlock,
  VisionTable,
} from "@/lib/vision/types";

function escapeCell(value: string | number | null | undefined): string {
  if (value == null) return "";
  return String(value).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function tableMarkdown(headers: string[], rows: Array<Array<string | number | null>>): string {
  const safeHeaders = headers.length > 0 ? headers : ["項目"];
  const header = `| ${safeHeaders.map(escapeCell).join(" | ")} |`;
  const sep = `| ${safeHeaders.map(() => "---").join(" | ")} |`;
  const body = rows.map(
    (row) =>
      `| ${safeHeaders
        .map((_, i) => escapeCell(row[i] ?? ""))
        .join(" | ")} |`,
  );
  return [header, sep, ...body].join("\n");
}

function blockToMarkdown(block: VisionDocumentBlock): string {
  switch (block.type) {
    case "title":
      return block.text?.trim() ? `# ${block.text.trim()}` : "";
    case "heading": {
      const level = Math.min(3, Math.max(2, Number(block.level) || 2));
      const marks = "#".repeat(level);
      return block.text?.trim() ? `${marks} ${block.text.trim()}` : "";
    }
    case "paragraph":
      return block.text?.trim() ?? "";
    case "bullet":
      return (block.items ?? [])
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => `- ${item}`)
        .join("\n");
    case "numbered":
      return (block.items ?? [])
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item, i) => `${i + 1}. ${item}`)
        .join("\n");
    case "table":
      return tableMarkdown(block.headers ?? [], block.rows ?? []);
    case "page_break":
      return "\n---\n";
    default:
      return "";
  }
}

/** Convert vision structure blocks into Word-ready markdown. */
export function documentStructureToMarkdown(
  blocks: readonly VisionDocumentBlock[] | null | undefined,
): string {
  if (!blocks?.length) return "";
  return blocks
    .map(blockToMarkdown)
    .filter((part) => part.trim().length > 0)
    .join("\n\n")
    .trim();
}

/** Prefer first image structure; else merge tables into a document skeleton. */
export function batchStructureToMarkdown(batch: VisionBatchResult): string {
  for (const image of batch.images) {
    const fromBlocks = documentStructureToMarkdown(image.documentStructure);
    if (fromBlocks.length >= 40) return fromBlocks;
  }

  const sections = batch.images[0]?.layout?.sections?.filter(Boolean) ?? [];
  const tables: VisionTable[] =
    batch.mergedTables.length > 0
      ? batch.mergedTables
      : batch.images.flatMap((image) => image.tables);

  if (sections.length === 0 && tables.length === 0) return "";

  const title =
    batch.images[0]?.fields &&
    typeof batch.images[0].fields.title === "string"
      ? String(batch.images[0].fields.title)
      : batch.combinedSummary.slice(0, 40) || "資料";

  const parts: string[] = [`# ${title}`];
  if (batch.combinedSummary.trim()) {
    parts.push(batch.combinedSummary.trim());
  }
  for (const section of sections) {
    parts.push(`## ${section}`, "");
  }
  for (const table of tables) {
    parts.push(tableMarkdown(table.headers, table.rows));
  }
  return parts.join("\n\n").trim();
}

/**
 * Deterministic Word-source QA for vision seeds (no LLM).
 * Fails when the seed is OCR-dump-like or missing document bones.
 */
export function validateVisionWordSeed(seed: string): {
  ok: boolean;
  issues: string[];
} {
  const text = seed.trim();
  const issues: string[] = [];
  if (text.length < 40) issues.push("too_short");
  if (!/^#\s+\S+/m.test(text)) issues.push("missing_title");
  const hasHeading = /^##\s+\S+/m.test(text);
  const hasList = /^[-*+]\s+\S+/m.test(text) || /^\d+\.\s+\S+/m.test(text);
  const hasTable = /\|.+\|/.test(text);
  const hasParagraph = text
    .split("\n")
    .some((line) => line.trim().length >= 20 && !line.trim().startsWith("#") && !line.includes("|"));
  if (!hasHeading && !hasList && !hasTable) issues.push("missing_structure");
  if (!hasParagraph && !hasTable && !hasList) issues.push("missing_body");
  if (/^画像解析結果$/m.test(text) && text.length < 120) issues.push("generic_ocr_dump");
  return { ok: issues.length === 0, issues };
}

/** One-pass repair: ensure title + section + body for weak seeds. */
export function repairVisionWordSeed(
  seed: string,
  batch: VisionBatchResult,
): string {
  const title =
    (typeof batch.images[0]?.fields?.title === "string" &&
      batch.images[0].fields.title.trim()) ||
    batch.combinedSummary.split(/[。\n]/)[0]?.slice(0, 40) ||
    "資料";
  const body =
    batch.images
      .map((image) => image.extractedText || image.summary)
      .filter(Boolean)
      .join("\n\n") || batch.combinedSummary;
  const sections = batch.images[0]?.layout?.sections?.filter(Boolean) ?? [];
  const table = batch.mergedTables[0] ?? batch.images[0]?.tables[0];
  const actions = batch.images[0]?.recommendedActions ?? [];

  const parts = [`# ${title}`];
  if (sections.length > 0) {
    for (const section of sections) {
      parts.push(`## ${section}`);
    }
  } else {
    parts.push("## 概要");
  }
  const paragraph =
    body.trim() ||
    "画像から読み取った内容をもとに資料を整えました。必要に応じて表現をご調整ください。";
  parts.push(
    paragraph.length >= 80
      ? paragraph
      : `${paragraph}\n\n本資料は画像内容を見出し・段落・表に整理したものです。業務でそのまま使える形を優先しています。`,
  );
  if (table) {
    parts.push("## 表", tableMarkdown(table.headers, table.rows));
  }
  if (actions.length > 0) {
    parts.push(
      "## 次の対応",
      ...actions.map((action, index) => `${index + 1}. ${action}`),
    );
  } else {
    parts.push(
      "## 確認事項",
      "- 固有名詞と数値に誤りがないかご確認ください",
      "- 見出し構成が意図どおりかご確認ください",
    );
  }
  if (seed.trim().length > 40 && !seed.includes(paragraph.slice(0, 20))) {
    parts.push("## 補足", seed.trim());
  }
  return parts.join("\n\n");
}
