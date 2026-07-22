import type { DocumentType, TemplateId } from "@/lib/documents/schema/enums";

const TYPE_TO_TEMPLATE: Record<DocumentType, TemplateId> = {
  proposal: "proposal",
  plan: "business",
  report: "report",
  research: "report",
  minutes: "minutes",
  manual: "manual",
  sales: "business",
  comparison: "comparison",
  estimate: "business",
  schedule: "simple",
  list: "simple",
  general: "simple",
};

/** Auto-select template from document type — no AI. */
export function templateForDocumentType(documentType: DocumentType): TemplateId {
  return TYPE_TO_TEMPLATE[documentType] ?? "business";
}

export function isValidTemplateForType(
  documentType: DocumentType,
  templateId: TemplateId,
): boolean {
  return TEMPLATE_IDS.includes(templateId);
}

const TEMPLATE_IDS = [
  "business",
  "simple",
  "proposal",
  "report",
  "minutes",
  "manual",
  "comparison",
] as const satisfies readonly TemplateId[];

export const TEMPLATE_LABELS: Record<TemplateId, string> = {
  business: "ビジネス",
  simple: "シンプル",
  proposal: "提案書",
  report: "レポート",
  minutes: "議事録",
  manual: "マニュアル",
  comparison: "比較表",
};
