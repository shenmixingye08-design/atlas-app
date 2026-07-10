import type { DeliverableFormat } from "@/lib/deliverables/types";

import { DRIVE_CATEGORY_FOLDERS } from "./constants";
import type { DriveCategoryId } from "./types";

export function isDriveCategoryId(value: string): value is DriveCategoryId {
  return (
    value === "sales_material" ||
    value === "blog" ||
    value === "sns" ||
    value === "email" ||
    value === "other"
  );
}

export function parseDriveCategoryParam(
  value: string | null,
): DriveCategoryId | "all" | null {
  if (!value || value === "all") return value === "all" ? "all" : null;
  if (!isDriveCategoryId(value)) return null;
  return value;
}

export function getDriveCategoryLabel(category: DriveCategoryId | "all"): string {
  if (category === "all") return "すべて";
  return DRIVE_CATEGORY_FOLDERS[category];
}

export function inferDriveCategoryFromAssignment(
  assignment: string,
): DriveCategoryId {
  const text = assignment.toLowerCase();

  if (/営業資料|sales\s*material|提案資料|pitch/i.test(assignment)) {
    return "sales_material";
  }
  if (/ブログ|blog|記事/i.test(assignment)) {
    return "blog";
  }
  if (/sns|ツイート|twitter|x投稿|ソーシャル/i.test(assignment)) {
    return "sns";
  }
  if (/メール|mail|email/i.test(text)) {
    return "email";
  }

  return "other";
}

export function inferDriveCategoryFromFormat(
  format: DeliverableFormat,
): DriveCategoryId {
  switch (format) {
    case "pptx":
      return "sales_material";
    case "md":
      return "blog";
    case "txt":
      return "sns";
    case "docx":
      return "email";
    default:
      return "other";
  }
}

export function isSupportedDriveFormat(
  format: string,
): format is DeliverableFormat {
  return (
    format === "pdf" ||
    format === "docx" ||
    format === "pptx" ||
    format === "md" ||
    format === "txt"
  );
}
