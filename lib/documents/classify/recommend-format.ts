import type { DocumentModel } from "@/lib/documents/schema/document-model.zod";
import type { OutputFormat } from "@/lib/documents/schema/enums";

export type FormatRecommendation = {
  recommended: OutputFormat;
  alternatives: OutputFormat[];
  reason: string;
};

function countTableRows(model: DocumentModel): number {
  let count = 0;
  for (const section of model.sections) {
    for (const block of section.blocks) {
      if (block.type === "table") {
        count += block.rows.length;
      }
    }
  }
  return count;
}

function hasNumericTable(model: DocumentModel): boolean {
  for (const section of model.sections) {
    for (const block of section.blocks) {
      if (block.type !== "table") continue;
      const cells = [...block.headers, ...block.rows.flat()];
      if (cells.some((cell) => /[%¥￥$]|^\d+[,.]?\d*$/.test(cell.trim()))) {
        return true;
      }
    }
  }
  return false;
}

/** Suggest Word/PDF vs Excel from IR structure — no AI. */
export function recommendOutputFormat(model: DocumentModel): FormatRecommendation {
  const tableRows = countTableRows(model);
  const numeric = hasNumericTable(model);
  const listHeavy =
    model.documentType === "schedule" ||
    model.documentType === "list" ||
    model.documentType === "estimate" ||
    model.documentType === "comparison";

  if (tableRows >= 8 || (numeric && tableRows >= 3) || listHeavy) {
    return {
      recommended: "xlsx",
      alternatives: ["docx", "pdf"],
      reason: "表や数値データが多いため、Excelがおすすめです",
    };
  }

  if (model.documentType === "minutes" || model.documentType === "manual") {
    return {
      recommended: "docx",
      alternatives: ["pdf"],
      reason: "編集しやすいWord形式がおすすめです",
    };
  }

  return {
    recommended: "pdf",
    alternatives: ["docx"],
    reason: "共有・印刷向けのPDFがおすすめです",
  };
}

export function resolveFormatsFromRecommendation(
  recommendation: FormatRecommendation,
  userSelected?: OutputFormat[],
): OutputFormat[] {
  if (userSelected && userSelected.length > 0) {
    return userSelected;
  }
  return [recommendation.recommended, ...recommendation.alternatives.slice(0, 1)];
}
