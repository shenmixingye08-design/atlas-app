import { NO_FABRICATION_RULE, sanitizeUserItemText } from "./safety";
import type {
  DeliverableBatch,
  DeliverableBatchCommon,
  DeliverableBatchItem,
} from "./types";

export function buildItemAssignment(
  batch: Pick<DeliverableBatch, "common" | "format" | "name">,
  item: Pick<
    DeliverableBatchItem,
    "title" | "theme" | "individualInstruction" | "forbidden" | "order"
  >,
  sampleStyle?: string | null,
): string {
  const common = batch.common;
  const forbidden = [common.forbidden, item.forbidden]
    .filter(Boolean)
    .join(" / ");
  return [
    `「${item.title}」の${formatLabel(batch.format)}を1件作ってください。`,
    item.theme ? `テーマ: ${item.theme}` : "",
    item.individualInstruction ? `個別指示: ${item.individualInstruction}` : "",
    common.purpose ? `目的: ${common.purpose}` : "",
    common.audience ? `対象読者: ${common.audience}` : "",
    common.tone ? `文体: ${common.tone}` : "",
    common.length ? `長さ: ${common.length}` : "",
    common.structure ? `構成: ${common.structure}` : "",
    common.mustInclude ? `必ず含める: ${common.mustInclude}` : "",
    forbidden ? `禁止事項（最優先）: ${forbidden}` : "",
    sampleStyle ? `確定した文体・構成: ${sampleStyle}` : "",
    NO_FABRICATION_RULE,
    "この項目の情報だけを使い、他の項目の内容を混ぜない。",
  ]
    .filter(Boolean)
    .join("\n");
}

function formatLabel(format: DeliverableBatch["format"]): string {
  switch (format) {
    case "docx":
      return "Word資料";
    case "xlsx":
      return "Excel資料";
    case "pdf":
      return "PDF資料";
    case "pptx":
      return "PowerPoint資料";
    default:
      return "テキスト";
  }
}

export function composeItemSourceContent(
  common: DeliverableBatchCommon,
  item: Pick<
    DeliverableBatchItem,
    "title" | "theme" | "individualInstruction" | "forbidden" | "order"
  >,
  sampleStyle?: string | null,
): string {
  const forbidden = [common.forbidden, item.forbidden]
    .map((value) => sanitizeUserItemText(value))
    .filter(Boolean)
    .join("、");
  const sections = [
    `# ${item.title || item.theme || `項目${item.order + 1}`}`,
    "",
    common.purpose ? `目的: ${sanitizeUserItemText(common.purpose)}` : "",
    common.audience ? `対象: ${sanitizeUserItemText(common.audience)}` : "",
    common.tone ? `文体: ${sanitizeUserItemText(common.tone)}` : "",
    item.theme ? `テーマ: ${sanitizeUserItemText(item.theme)}` : "",
    "",
    sanitizeUserItemText(item.individualInstruction) ||
      sanitizeUserItemText(common.mustInclude) ||
      `${item.title}について、入力された範囲だけで整理します。`,
    "",
    common.structure
      ? `構成: ${sanitizeUserItemText(common.structure)}`
      : "構成: 要点、本文、次の行動",
    common.mustInclude
      ? `含める内容: ${sanitizeUserItemText(common.mustInclude)}`
      : "",
    forbidden ? `使わない表現: ${forbidden}` : "",
    sampleStyle ? `確定スタイル: ${sanitizeUserItemText(sampleStyle)}` : "",
    "",
    "事実は入力された内容だけを使います。実績・価格・資格・受賞・顧客名・連絡先・法律・補助金は、入力に無い限り書きません。",
  ];
  return sections.filter((line, index, all) => line !== "" || all[index - 1] !== "").join("\n");
}

export function emptyCommon(): DeliverableBatchCommon {
  return {
    purpose: "",
    audience: "",
    tone: "",
    length: "",
    structure: "",
    template: "",
    mustInclude: "",
    forbidden: "",
    fileNameRule: "",
  };
}

export function styleNoteFromContent(content: string): string {
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6);
  return lines.join(" / ").slice(0, 240);
}
