import type { DeliverableFormat } from "@/lib/deliverables/types";
import { classifyDeliverableType } from "@/lib/orchestration/deliverable-classification";

import type { UserProgressKind } from "./types";

/** Infer user-facing progress kind from assignment + optional metadata/formats. */
export function resolveUserProgressKind(input: {
  assignment: string;
  metadata?: Readonly<Record<string, unknown>> | null;
  formats?: readonly DeliverableFormat[] | null;
}): UserProgressKind {
  const meta = input.metadata ?? {};
  const metaKind =
    typeof meta.userProgressKind === "string"
      ? meta.userProgressKind
      : typeof meta.progressKind === "string"
        ? meta.progressKind
        : null;
  if (
    metaKind === "sales_material" ||
    metaKind === "blog" ||
    metaKind === "receipt" ||
    metaKind === "excel" ||
    metaKind === "pdf" ||
    metaKind === "sns" ||
    metaKind === "generic"
  ) {
    return metaKind;
  }

  if (meta.salesMaterialConfig || meta.salesMaterial) {
    return "sales_material";
  }
  if (meta.receiptPipeline || meta.householdLedger) {
    return "receipt";
  }

  const assignment = input.assignment;
  if (/レシート|領収書|家計簿|receipt/i.test(assignment)) {
    return "receipt";
  }
  if (/sns|ツイート|twitter|x投稿|投稿文|ソーシャル/i.test(assignment)) {
    return "sns";
  }
  if (/excel|エクセル|xlsx|表計算|スプレッドシート/i.test(assignment)) {
    return "excel";
  }
  if (/\bpdf\b|PDF/i.test(assignment)) {
    return "pdf";
  }

  const formats = input.formats ?? [];
  if (formats.includes("xlsx") && formats.length === 1) return "excel";
  if (formats.includes("pdf") && !formats.includes("docx")) return "pdf";

  const classified = classifyDeliverableType(assignment);
  if (classified === "presentation" || classified === "proposal") {
    return "sales_material";
  }
  if (classified === "blog") return "blog";
  if (classified === "social_post") return "sns";

  if (formats.includes("docx") || formats.includes("pptx")) {
    return "sales_material";
  }

  return "generic";
}
